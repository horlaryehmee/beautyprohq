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
        public readonly string $deliveryMethod,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'BeautyPro HQ email connection test',
        );
    }

    public function content(): Content
    {
        return new Content(
            htmlString: '<p>This is a test email from BeautyPro HQ.</p><p>Your email connection is working.</p><p>Delivery method: <strong>'.e($this->deliveryMethod).'</strong></p>',
        );
    }
}
