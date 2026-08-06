<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class SmtpConnectionTestMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly string $sentBy,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'BeautyPro HQ SMTP test email',
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: '<p>This is a test email from BeautyPro HQ.</p><p>Your SMTP connection is working.</p><p>Sent by: '.e($this->sentBy).'</p>',
        );
    }
}
