<?php

namespace App\Services;

use App\Models\AppSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TwilioWhatsAppService
{
    private ?string $lastError = null;

    public function configured(): bool
    {
        return filled($this->accountSid())
            && filled($this->authToken())
            && filled($this->whatsappFrom());
    }

    public function send(string $to, string $body): bool
    {
        $this->lastError = null;

        if (! $this->configured() || blank($to)) {
            $this->lastError = 'Twilio WhatsApp is not fully configured.';

            return false;
        }

        $accountSid = (string) $this->accountSid();
        $from = $this->formatWhatsappAddress((string) $this->whatsappFrom());
        $recipient = $this->formatWhatsappAddress($to);

        if (! $from || ! $recipient) {
            $this->lastError = 'The sender or recipient is not a valid international WhatsApp number.';

            return false;
        }

        try {
            $payload = [
                'From' => $from,
                'To' => $recipient,
            ];
            $contentSid = $this->contentSid();

            if (filled($contentSid)) {
                $payload['ContentSid'] = $contentSid;
                if (filled($this->contentVariables())) {
                    $payload['ContentVariables'] = $this->contentVariables();
                }
            } else {
                $payload['Body'] = mb_substr($body, 0, 1500);
            }

            $response = Http::external()
                ->withBasicAuth($accountSid, (string) $this->authToken())
                ->asForm()
                ->post("https://api.twilio.com/2010-04-01/Accounts/{$accountSid}/Messages.json", $payload);

            if ($response->successful()) {
                return true;
            }

            $code = $response->json('code');
            $message = $response->json('message');
            $this->lastError = trim(sprintf(
                'Twilio%s: %s',
                filled($code) ? " error {$code}" : '',
                filled($message) ? mb_substr((string) $message, 0, 500) : 'The message request was rejected.'
            ));

            Log::warning('Twilio WhatsApp notification failed.', [
                'status' => $response->status(),
                'error_code' => $code,
            ]);
        } catch (\Throwable $exception) {
            $this->lastError = 'The application could not connect to Twilio.';
            Log::warning('Twilio WhatsApp notification exception.', [
                'exception' => $exception::class,
            ]);
        }

        return false;
    }

    public function lastError(): ?string
    {
        return $this->lastError;
    }

    private function formatWhatsappAddress(string $value): ?string
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        if (str_starts_with($value, 'whatsapp:')) {
            $value = substr($value, 9);
        }

        $value = preg_replace('/[\s().-]+/', '', $value) ?? '';
        if ($value === '') {
            return null;
        }

        if (str_starts_with($value, '00')) {
            $value = '+'.substr($value, 2);
        } elseif (str_starts_with($value, '0')) {
            $value = '+234'.substr($value, 1);
        } elseif (! str_starts_with($value, '+')) {
            $value = '+'.$value;
        }

        return preg_match('/^\+\d{8,15}$/', $value) ? 'whatsapp:'.$value : null;
    }

    private function accountSid(): ?string
    {
        return AppSetting::getValue('twilio.account_sid') ?: config('services.twilio.account_sid');
    }

    private function authToken(): ?string
    {
        return AppSetting::getValue('twilio.auth_token') ?: config('services.twilio.auth_token');
    }

    private function whatsappFrom(): ?string
    {
        return AppSetting::getValue('twilio.whatsapp_from') ?: config('services.twilio.whatsapp_from');
    }

    private function contentSid(): ?string
    {
        return AppSetting::getValue('twilio.content_sid') ?: config('services.twilio.content_sid');
    }

    private function contentVariables(): ?string
    {
        return AppSetting::getValue('twilio.content_variables') ?: config('services.twilio.content_variables');
    }
}
