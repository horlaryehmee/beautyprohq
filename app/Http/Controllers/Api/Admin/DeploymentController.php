<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\Process\Process;

class DeploymentController extends Controller
{
    private const STATUS_PATH = 'admin-deploy-latest.json';

    public function status(): JsonResponse
    {
        return $this->success($this->payload());
    }

    public function run(): JsonResponse
    {
        if (! is_dir(base_path('.git'))) {
            return $this->runCpanelDeployment();
        }

        $exitCode = Artisan::call('deploy:from-git', [
            '--remote' => 'origin',
            '--branch' => 'main',
        ]);

        $payload = $this->payload();
        $payload['artisan_output'] = trim(Artisan::output());

        return $this->success(
            $payload,
            $exitCode === 0 ? 'Deployment completed.' : 'Deployment failed. Review the log before retrying.',
            $exitCode === 0 ? 200 : 422,
        );
    }

    private function runCpanelDeployment(): JsonResponse
    {
        $startedAt = now();
        $sourceRoot = $this->cpanelSourceRoot();

        if (! $sourceRoot) {
            $payload = $this->writeStatus([
                'status' => 'failed',
                'exit_code' => 1,
                'remote' => 'origin',
                'branch' => 'main',
                'started_at' => $startedAt->toIso8601String(),
                'finished_at' => now()->toIso8601String(),
                'log' => 'Deployment source checkout was not found. Set DEPLOY_SOURCE_ROOT to the cPanel Git repository path.',
            ]);

            return $this->success($payload, 'Deployment failed. Review the log before retrying.', 422);
        }

        $script = $sourceRoot.DIRECTORY_SEPARATOR.'scripts'.DIRECTORY_SEPARATOR.'cpanel-deploy.sh';
        $process = new Process(['/bin/bash', $script], $sourceRoot, [
            'APP_ROOT' => base_path(),
            'SOURCE_ROOT' => $sourceRoot,
            'BRANCH' => 'main',
        ], null, 900);
        $process->run();

        $output = trim($process->getOutput().PHP_EOL.$process->getErrorOutput());
        $exitCode = $process->getExitCode() ?? 1;
        $payload = $this->writeStatus([
            'status' => $exitCode === 0 ? 'succeeded' : 'failed',
            'exit_code' => $exitCode,
            'remote' => 'origin',
            'branch' => 'main',
            'started_at' => $startedAt->toIso8601String(),
            'finished_at' => now()->toIso8601String(),
            'log' => $output,
            'artisan_output' => $output,
        ]);

        return $this->success(
            $payload,
            $exitCode === 0 ? 'Deployment completed.' : 'Deployment failed. Review the log before retrying.',
            $exitCode === 0 ? 200 : 422,
        );
    }

    private function cpanelSourceRoot(): ?string
    {
        $configured = config('deployment.source_root');
        $candidates = array_filter([
            is_string($configured) ? $configured : null,
            dirname(base_path()).DIRECTORY_SEPARATOR.'repositories'.DIRECTORY_SEPARATOR.'beautyprohq',
        ]);

        foreach ($candidates as $candidate) {
            $resolved = realpath($candidate);
            if ($resolved
                && is_dir($resolved.DIRECTORY_SEPARATOR.'.git')
                && is_file($resolved.DIRECTORY_SEPARATOR.'scripts'.DIRECTORY_SEPARATOR.'cpanel-deploy.sh')) {
                return $resolved;
            }
        }

        return null;
    }

    private function writeStatus(array $payload): array
    {
        Storage::disk('local')->put(self::STATUS_PATH, json_encode($payload, JSON_PRETTY_PRINT));

        return $payload;
    }

    public function clearCache(): JsonResponse
    {
        $startedAt = now();
        $lines = [];
        $failed = false;

        foreach ([
            'optimize:clear',
            'cache:clear',
            'config:clear',
            'route:clear',
            'view:clear',
            'event:clear',
            'clear-compiled',
            'queue:restart',
        ] as $command) {
            try {
                $exitCode = Artisan::call($command);
                $output = trim(Artisan::output());
                $lines[] = sprintf('php artisan %s: %s', $command, $exitCode === 0 ? 'ok' : "failed ({$exitCode})");
                if ($output !== '') {
                    $lines[] = $output;
                }
                $failed = $failed || $exitCode !== 0;
            } catch (\Throwable $exception) {
                $failed = true;
                $lines[] = sprintf('php artisan %s: failed - %s', $command, $exception->getMessage());
            }
        }

        try {
            Cache::flush();
            $lines[] = 'Application cache store: flushed';
        } catch (\Throwable $exception) {
            $failed = true;
            $lines[] = 'Application cache store: failed - '.$exception->getMessage();
        }

        if (function_exists('opcache_reset')) {
            try {
                $reset = @opcache_reset();
                $lines[] = 'PHP OPcache: '.($reset ? 'reset' : 'not available for this SAPI');
            } catch (\Throwable $exception) {
                $lines[] = 'PHP OPcache: failed - '.$exception->getMessage();
            }
        } else {
            $lines[] = 'PHP OPcache: extension not loaded';
        }

        $payload = [
            'status' => $failed ? 'cache_clear_attention' : 'cache_cleared',
            'exit_code' => $failed ? 1 : 0,
            'remote' => 'origin',
            'branch' => 'main',
            'started_at' => $startedAt->toIso8601String(),
            'finished_at' => now()->toIso8601String(),
            'log' => implode(PHP_EOL, $lines),
            'artisan_output' => implode(PHP_EOL, $lines),
        ];

        Storage::disk('local')->put(self::STATUS_PATH, json_encode($payload, JSON_PRETTY_PRINT));

        return $this->success(
            $payload,
            $failed ? 'Cache clear completed with warnings. Review the log.' : 'Hard cache clear completed.',
            $failed ? 207 : 200,
        );
    }

    private function payload(): array
    {
        if (! Storage::disk('local')->exists(self::STATUS_PATH)) {
            return [
                'status' => 'never_run',
                'exit_code' => null,
                'remote' => 'origin',
                'branch' => 'main',
                'started_at' => null,
                'finished_at' => null,
                'log' => '',
            ];
        }

        $payload = json_decode((string) Storage::disk('local')->get(self::STATUS_PATH), true);

        return is_array($payload) ? $payload : [
            'status' => 'unknown',
            'exit_code' => null,
            'remote' => 'origin',
            'branch' => 'main',
            'started_at' => null,
            'finished_at' => null,
            'log' => '',
        ];
    }
}
