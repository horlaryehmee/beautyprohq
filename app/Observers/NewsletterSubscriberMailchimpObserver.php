<?php

namespace App\Observers;

use App\Models\NewsletterSubscriber;
use App\Services\MailchimpService;

class NewsletterSubscriberMailchimpObserver
{
    public function saved(NewsletterSubscriber $subscriber): void
    {
        app(MailchimpService::class)->syncNewsletterSubscriber($subscriber);
    }
}
