<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Artisan;
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
