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
        $approved = $this->verification->status === 'approved';
        $mail = (new MailMessage)
            ->subject($approved ? 'Your BeautyPro HQ verified badge has been approved' : 'BeautyPro HQ verification update')
            ->line($approved
                ? 'Your BPHQ verified badge has been approved and will now show on your public profile.'
                : "Your verification request was {$this->verification->status}.");

        if ($this->verification->admin_notes) {
            $mail->line($this->verification->admin_notes);
        }

        return $mail->action('View verification', rtrim(config('app.frontend_url', config('app.url')), '/').'/provider/profile');
    }

    public function toArray(object $notifiable): array
    {
        return [
            'title' => $this->verification->status === 'approved' ? 'Verified badge approved' : 'Verification update',
            'message' => $this->verification->status === 'approved'
                ? 'Your BPHQ verified badge has been approved and will now show on your public profile.'
                : "Your verification request was {$this->verification->status}.",
            'verification_id' => $this->verification->id,
            'status' => $this->verification->status,
        ];
    }
}
