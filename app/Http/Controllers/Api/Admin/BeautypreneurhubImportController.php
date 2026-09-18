<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\BeautypreneurhubImport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BeautypreneurhubImportController extends Controller
{
    public function show(BeautypreneurhubImport $import): JsonResponse
    {
        return $this->success($import->status());
    }

    public function store(Request $request, BeautypreneurhubImport $import): JsonResponse
    {
        abort_if($import->status()['completed'], 409, 'Beautypreneurhub data has already been imported.');
        abort_unless(class_exists(\ZipArchive::class), 422, 'Enable the PHP ZIP extension on the server to import this file.');
        $validated = $request->validate(['package' => ['required', 'file', 'max:25600']]);
        $result = $import->run($validated['package']->getRealPath(), $request->user()->id);

        return $this->success(['completed' => true, 'result' => $result], 'Beautypreneurhub migration completed.');
    }
}
