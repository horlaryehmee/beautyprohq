<?php

namespace App\Console\Commands;

use App\Services\BeautypreneurhubImport;
use Illuminate\Console\Command;

class ExportBeautypreneurhub extends Command
{
    protected $signature = 'beautypreneurhub:export';

    protected $description = 'Package imported Beautypreneurhub listings and images for the live admin importer';

    public function handle(BeautypreneurhubImport $import): int
    {
        $directory = storage_path('app/private/migrations');
        if (! is_dir($directory)) {
            mkdir($directory, 0700, true);
        }
        $path = $directory.'/beautypreneurhub.zip';
        $count = $import->export($path);
        $this->info("Packaged {$count} listings: {$path}");

        return self::SUCCESS;
    }
}
