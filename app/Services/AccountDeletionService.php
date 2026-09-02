<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\Availability;
use App\Models\Booking;
use App\Models\CommunityPost;
use App\Models\CrmCustomer;
use App\Models\DigitalProduct;
use App\Models\EventRegistration;
use App\Models\LiveChatConversation;
use App\Models\Loyalty;
use App\Models\LoyaltyTransaction;
use App\Models\NewsletterSubscriber;
use App\Models\Payment;
use App\Models\PaymentAccount;
use App\Models\PortfolioItem;
use App\Models\ProviderProfile;
use App\Models\Review;
use App\Models\Reward;
use App\Models\SavedProvider;
use App\Models\Service;
use App\Models\Subscription;
use App\Models\SubscriptionPayment;
use App\Models\UploadedMedia;
use App\Models\User;
use App\Models\VerificationRequest;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class AccountDeletionService
{
    public function delete(User $user): void
    {
        $this->stopRecurringBilling($user);

        $media = Schema::hasTable('uploaded_media')
            ? UploadedMedia::where('user_id', $user->id)->get(['id', 'disk', 'path'])
            : collect();

        DB::transaction(function () use ($user): void {
            $user = User::query()->lockForUpdate()->findOrFail($user->id);
            $profile = $user->providerProfile()->first();
            $providerIds = $profile ? collect([$profile->id]) : collect();
            $userIds = collect([$user->id]);
            $bookingIds = Booking::whereIn('customer_id', $userIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->pluck('id');
            $loyaltyIds = Loyalty::whereIn('customer_id', $userIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->pluck('id');

            $user->tokens()->delete();
            $user->notifications()->delete();
            EventRegistration::whereIn('user_id', $userIds)->delete();
            LiveChatConversation::whereIn('customer_id', $userIds)->delete();
            SubscriptionPayment::whereIn('user_id', $userIds)->delete();
            Subscription::whereIn('user_id', $userIds)->delete();
            Payment::whereIn('booking_id', $bookingIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->delete();
            LoyaltyTransaction::whereIn('loyalty_id', $loyaltyIds)->orWhereIn('booking_id', $bookingIds)->delete();
            Loyalty::whereIn('id', $loyaltyIds)->delete();
            CrmCustomer::whereIn('customer_id', $userIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->delete();
            SavedProvider::whereIn('customer_id', $userIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->delete();
            Review::whereIn('customer_id', $userIds)
                ->when($providerIds->isNotEmpty(), fn ($query) => $query->orWhereIn('provider_id', $providerIds))
                ->delete();
            Booking::whereIn('id', $bookingIds)->delete();

            DB::table('community_shares')->whereIn('user_id', $userIds)->delete();
            DB::table('community_reports')->whereIn('user_id', $userIds)->delete();
            DB::table('opportunity_enquiries')->whereIn('user_id', $userIds)->delete();
            DB::table('contact_enquiries')->whereIn('user_id', $userIds)->delete();
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();
            NewsletterSubscriber::where('email', $user->email)->delete();

            if (Schema::hasTable('uploaded_media')) {
                UploadedMedia::whereIn('user_id', $userIds)->delete();
            }

            if ($providerIds->isNotEmpty()) {
                PaymentAccount::whereIn('provider_id', $providerIds)->delete();
                DigitalProduct::whereIn('provider_id', $providerIds)->delete();
                Reward::whereIn('provider_id', $providerIds)->delete();
                VerificationRequest::whereIn('provider_id', $providerIds)->delete();
                PortfolioItem::whereIn('provider_id', $providerIds)->delete();
                Availability::whereIn('provider_id', $providerIds)->delete();
                Service::whereIn('provider_id', $providerIds)->delete();
                CommunityPost::whereIn('provider_id', $providerIds)->delete();
                ProviderProfile::whereIn('id', $providerIds)->delete();
            }

            $user->delete();
        });

        $media->each(function (UploadedMedia $item): void {
            try {
                Storage::disk($item->disk ?: config('filesystems.upload_disk', 'public'))->delete($item->path);
            } catch (\Throwable $exception) {
                report($exception);
            }
        });

        Cache::forget('public.home.payload.v6');
        Cache::forget('public.home.payload.v5');
    }

    private function stopRecurringBilling(User $user): void
    {
        if (! $user->isProvider()) {
            return;
        }

        $subscription = $user->activeSubscription()->first();
        if (! $subscription?->isPaid() || data_get($subscription->metadata, 'gateway') !== 'paystack') {
            return;
        }

        $code = data_get($subscription->metadata, 'paystack_subscription_code');
        $token = data_get($subscription->metadata, 'paystack_email_token');

        if (blank($code) || blank($token)) {
            $payment = SubscriptionPayment::where('subscription_id', $subscription->id)
                ->where('gateway', 'paystack')
                ->where('status', 'paid')
                ->latest()
                ->first();
            $code ??= data_get($payment?->raw_response, 'data.subscription.subscription_code')
                ?: data_get($payment?->raw_response, 'data.subscription_code');
            $token ??= data_get($payment?->raw_response, 'data.subscription.email_token')
                ?: data_get($payment?->raw_response, 'data.email_token');
        }

        $secret = $this->paystackSecretKey();
        if (blank($code) || blank($token) || blank($secret)) {
            throw ValidationException::withMessages([
                'account' => 'We could not safely stop your active Paystack renewal. Contact support before deleting this account.',
            ]);
        }

        $response = Http::external()->withToken($secret)
            ->acceptJson()
            ->post('https://api.paystack.co/subscription/disable', [
                'code' => $code,
                'token' => $token,
            ]);

        if (! $response->successful() || ! $response->json('status')) {
            throw ValidationException::withMessages([
                'account' => 'Paystack could not stop your active renewal. Your account was not deleted; please try again or contact support.',
            ]);
        }
    }

    private function paystackSecretKey(): ?string
    {
        $live = AppSetting::getValue('paystack.mode', 'test') === 'live';

        return $live
            ? AppSetting::getValue('paystack.live_secret_key')
            : (AppSetting::getValue('paystack.test_secret_key') ?: config('services.paystack.secret_key'));
    }
}
