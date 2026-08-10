<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Support\CurrencyResolver;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CurrencyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        return $this->success([
            'default' => CurrencyResolver::defaultCurrency(),
            'detected' => CurrencyResolver::currencyForRequest($request),
            'supported' => CurrencyResolver::supportedPayload(),
        ]);
    }
}
