<?php

namespace App\Mail\Transport;

use App\Services\GoogleWorkspaceMailService;
use Symfony\Component\Mailer\Exception\TransportException;
use Symfony\Component\Mailer\SentMessage;
use Symfony\Component\Mailer\Transport\AbstractTransport;

class GoogleWorkspaceTransport extends AbstractTransport
{
    public function __construct(private readonly GoogleWorkspaceMailService $workspace)
    {
        parent::__construct();
    }

    public function __toString(): string
    {
        return 'google-workspace';
    }

    protected function doSend(SentMessage $message): void
    {
        try {
            $messageId = $this->workspace->send($message->getMessage()->toString());
            if ($messageId !== '') {
                $message->setMessageId($messageId);
            }
        } catch (\Throwable $exception) {
            throw new TransportException('Google Workspace could not send the email: '.$exception->getMessage(), 0, $exception);
        }
    }
}
