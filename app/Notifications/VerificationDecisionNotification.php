<?php

namespace App\Notifications;

use App\Models\VerificationRequest;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class VerificationDecisionNotification extends Notification
{
    use Queueable;

    public function __construct(public VerificationRequest $verification) {}

    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = (new MailMessage)->subject('BeautyPro HQ verification update')->line("Your verification request was {$this->verification->status}.");
        if ($this->verification->admin_notes) {
            $mail->line($this->verification->admin_notes);
        }

        return $mail->action('View verification', rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/profile');
    }

    public function toArray(object $notifiable): array
    {
        return ['title' => 'Verification update', 'message' => "Your verification request was {$this->verification->status}.", 'verification_id' => $this->verification->id, 'status' => $this->verification->status];
    }
}
