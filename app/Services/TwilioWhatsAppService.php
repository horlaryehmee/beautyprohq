<?php

namespace App\Services;

use App\Models\AppSetting;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class TwilioWhatsAppService
{
    public function configured(): bool
    {
        return filled($this->accountSid())
            && filled($this->authToken())
            && filled($this->whatsappFrom());
    }

    public function send(string $to, string $body): bool
    {
        if (! $this->configured() || blank($to)) {
            return false;
        }

        $accountSid = (string) $this->accountSid();
        $authToken = (string) $this->authToken();
        $from = $this->formatWhatsappAddress((string) $this->whatsappFrom());
        $recipient = $this->formatWhatsappAddress($to);

        if (! $from || ! $recipient) {
            return false;
        }

        try {
            $response = Http::withBasicAuth($accountSid, $authToken)
                ->asForm()
                ->post("https://api.twilio.com/2010-04-01/Accounts/{$accountSid}/Messages.json", [
                    'From' => $from,
                    'To' => $recipient,
                    'Body' => mb_substr($body, 0, 1500),
                ]);

            if ($response->successful()) {
                return true;
            }

            Log::warning('Twilio WhatsApp notification failed.', [
                'status' => $response->status(),
                'response' => $response->json() ?: $response->body(),
            ]);
        } catch (\Throwable $exception) {
            Log::warning('Twilio WhatsApp notification exception.', [
                'message' => $exception->getMessage(),
            ]);
        }

        return false;
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
}
