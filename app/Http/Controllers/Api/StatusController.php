<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;

class StatusController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return $this->success(['status' => 'ok', 'name' => 'BeautyPro HQ API']);
    }
}
