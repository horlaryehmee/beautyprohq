<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;

class DeploymentController extends Controller
{
    private const STATUS_PATH = 'admin-deploy-latest.json';

    public function status(): JsonResponse
    {
        return $this->success($this->payload());
    }

    public function run(): JsonResponse
    {
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
