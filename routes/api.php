<?php

use App\Http\Controllers\Api\Admin\ContentController as AdminContentController;
use App\Http\Controllers\Api\Admin\DashboardController as AdminDashboardController;
use App\Http\Controllers\Api\Admin\VerificationController as AdminVerificationController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BookingController;
use App\Http\Controllers\Api\CustomerController;
use App\Http\Controllers\Api\CurrencyController;
use App\Http\Controllers\Api\HomeController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\Provider\BookingController as ProviderBookingController;
use App\Http\Controllers\Api\Provider\BusinessController as ProviderBusinessController;
use App\Http\Controllers\Api\Provider\ContentCalendarController as ProviderContentCalendarController;
use App\Http\Controllers\Api\Provider\DashboardController as ProviderDashboardController;
use App\Http\Controllers\Api\Provider\ScheduleController as ProviderScheduleController;
use App\Http\Controllers\Api\Provider\ServiceController as ProviderServiceController;
use App\Http\Controllers\Api\ProviderDirectoryController;
use App\Http\Controllers\Api\PublicContentController;
use App\Http\Controllers\Api\StatusController;
use App\Http\Controllers\Api\SubscriptionController;
use Illuminate\Support\Facades\Route;

Route::get('/status', StatusController::class);

Route::prefix('auth')->group(function (): void {
    Route::post('/register', [AuthController::class, 'register'])->middleware('throttle:10,1');
    Route::post('/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:5,1');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:5,1');
});

Route::get('/email/verify/{id}/{hash}', [AuthController::class, 'verifyEmail'])
    ->middleware(['signed', 'throttle:6,1'])->name('verification.verify');

Route::get('/home', HomeController::class);
Route::get('/currencies', [CurrencyController::class, 'index']);
Route::get('/subscription-plans', [SubscriptionController::class, 'plans']);
Route::get('/provider-categories', [ProviderDirectoryController::class, 'categories']);
Route::get('/providers', [ProviderDirectoryController::class, 'index']);
Route::get('/providers/{provider}', [ProviderDirectoryController::class, 'show']);
Route::get('/providers/{provider}/services', [ProviderDirectoryController::class, 'services']);
Route::get('/providers/{provider}/availability', [ProviderDirectoryController::class, 'availability']);
Route::get('/providers/{provider}/reviews', [ProviderDirectoryController::class, 'reviews']);
Route::get('/news', [PublicContentController::class, 'news']);
Route::get('/news/{news:slug}', [PublicContentController::class, 'showNews']);
Route::get('/events', [PublicContentController::class, 'events']);
Route::get('/events/{event:slug}', [PublicContentController::class, 'showEvent']);
Route::get('/opportunities', [PublicContentController::class, 'opportunities']);
Route::get('/opportunities/{opportunity}', [PublicContentController::class, 'showOpportunity']);
Route::get('/community-posts', [PublicContentController::class, 'community']);
Route::get('/community-posts/{communityPost}', [PublicContentController::class, 'showCommunity']);
Route::post('/newsletter/subscribe', [PublicContentController::class, 'subscribe'])->middleware('throttle:10,1');
Route::post('/contact-enquiries', [PublicContentController::class, 'contact'])->middleware('throttle:10,1');
Route::post('/opportunities/{opportunity}/enquiries', [PublicContentController::class, 'enquire'])->middleware('throttle:10,1');
Route::post('/guest-bookings', [BookingController::class, 'guestStore'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::post('/email/verification-notification', [AuthController::class, 'sendVerification'])->middleware('throttle:6,1');

    Route::get('/notifications', [NotificationController::class, 'index']);
    Route::patch('/notifications/{id}/read', [NotificationController::class, 'read']);
    Route::post('/notifications/read-all', [NotificationController::class, 'readAll']);

    Route::middleware('role:customer')->group(function (): void {
        Route::get('/bookings', [BookingController::class, 'index']);
        Route::post('/bookings', [BookingController::class, 'store']);
        Route::get('/bookings/{booking}', [BookingController::class, 'show']);
        Route::patch('/bookings/{booking}/cancel', [BookingController::class, 'cancel']);
        Route::post('/providers/{provider}/reviews', [BookingController::class, 'review']);

        Route::get('/customer/dashboard', [CustomerController::class, 'dashboard']);
        Route::get('/customer/bookings', [BookingController::class, 'index']);
        Route::patch('/customer/bookings/{booking}/cancel', [BookingController::class, 'cancel']);
        Route::get('/customer/rewards', [CustomerController::class, 'rewards']);
        Route::get('/customer/saved-providers', [CustomerController::class, 'saved']);
        Route::post('/customer/saved-providers/{provider}', [CustomerController::class, 'save']);
        Route::delete('/customer/saved-providers/{provider}', [CustomerController::class, 'unsave']);
    });

    Route::prefix('provider')->middleware('role:provider')->group(function (): void {
        Route::get('/dashboard', [ProviderDashboardController::class, 'index']);
        Route::get('/profile', [ProviderDashboardController::class, 'profile']);
        Route::put('/profile', [ProviderDashboardController::class, 'updateProfile']);
        Route::post('/onboarding', [ProviderDashboardController::class, 'completeOnboarding']);
        Route::get('/verification', [ProviderDashboardController::class, 'verification']);
        Route::post('/verification', [ProviderDashboardController::class, 'submitVerification']);
        Route::get('/subscription', [SubscriptionController::class, 'current']);
        Route::post('/subscription/checkout', [SubscriptionController::class, 'checkout']);
        Route::post('/subscription/verify', [SubscriptionController::class, 'verify']);
        Route::post('/subscription/downgrade', [SubscriptionController::class, 'downgrade']);

        Route::middleware('paid.provider')->group(function (): void {
            Route::get('/analytics', [ProviderDashboardController::class, 'analytics']);
            Route::get('/services', [ProviderServiceController::class, 'index']);
            Route::post('/services', [ProviderServiceController::class, 'store']);
            Route::put('/services/{service}', [ProviderServiceController::class, 'update']);
            Route::delete('/services/{service}', [ProviderServiceController::class, 'destroy']);
            Route::get('/availability', [ProviderScheduleController::class, 'index']);
            Route::put('/availability', [ProviderScheduleController::class, 'update']);
            Route::get('/blocked-dates', [ProviderScheduleController::class, 'blocks']);
            Route::post('/blocked-dates', [ProviderScheduleController::class, 'storeBlock']);
            Route::delete('/blocked-dates/{blockedDate}', [ProviderScheduleController::class, 'destroyBlock']);
            Route::get('/bookings', [ProviderBookingController::class, 'index']);
            Route::patch('/bookings/{booking}/status', [ProviderBookingController::class, 'updateStatus']);
            Route::get('/payments', [ProviderBusinessController::class, 'payments']);
            Route::get('/payment-accounts', [ProviderBusinessController::class, 'paymentAccounts']);
            Route::put('/payment-accounts', [ProviderBusinessController::class, 'updatePaymentAccount']);
            Route::get('/digital-products', [ProviderBusinessController::class, 'products']);
            Route::post('/digital-products', [ProviderBusinessController::class, 'storeProduct']);
            Route::put('/digital-products/{digitalProduct}', [ProviderBusinessController::class, 'updateProduct']);
            Route::delete('/digital-products/{digitalProduct}', [ProviderBusinessController::class, 'destroyProduct']);
            Route::get('/content-calendar', [ProviderContentCalendarController::class, 'index']);
            Route::post('/content-calendar', [ProviderContentCalendarController::class, 'store']);
            Route::put('/content-calendar/{contentCalendarItem}', [ProviderContentCalendarController::class, 'update']);
            Route::delete('/content-calendar/{contentCalendarItem}', [ProviderContentCalendarController::class, 'destroy']);
            Route::get('/crm', [ProviderBusinessController::class, 'crm']);
            Route::put('/crm/{customer}', [ProviderBusinessController::class, 'updateCrm']);
            Route::post('/crm/{customer}/activities', [ProviderBusinessController::class, 'storeCrmActivity']);
            Route::patch('/crm/activities/{activity}', [ProviderBusinessController::class, 'updateCrmActivity']);
            Route::get('/loyalty', [ProviderBusinessController::class, 'loyalty']);
            Route::put('/loyalty/{customer}', [ProviderBusinessController::class, 'updateLoyalty']);
        });
    });

        Route::prefix('admin')->middleware('role:admin')->group(function (): void {
        Route::get('/dashboard', [AdminDashboardController::class, 'index']);
        Route::get('/activity', [AdminDashboardController::class, 'activity']);
        Route::get('/users', [AdminDashboardController::class, 'users']);
        Route::get('/users/{user}', [AdminDashboardController::class, 'showUser']);
        Route::patch('/users/{user}', [AdminDashboardController::class, 'updateUser']);
        Route::get('/directory', [AdminDashboardController::class, 'directory']);
        Route::patch('/providers/{provider}', [AdminDashboardController::class, 'updateProvider']);
        Route::get('/provider-categories', [AdminDashboardController::class, 'providerCategories']);
        Route::post('/provider-categories', [AdminDashboardController::class, 'storeProviderCategory']);
        Route::patch('/provider-categories/{category}', [AdminDashboardController::class, 'updateProviderCategory']);
        Route::delete('/provider-categories/{category}', [AdminDashboardController::class, 'destroyProviderCategory']);
        Route::get('/verifications', [AdminVerificationController::class, 'index']);
        Route::patch('/verifications/{verification}', [AdminVerificationController::class, 'update']);
        Route::get('/subscriptions', [AdminDashboardController::class, 'subscriptions']);
        Route::get('/subscription-plans', [SubscriptionController::class, 'adminPlans']);
        Route::put('/subscription-plans/{plan}', [SubscriptionController::class, 'updateAdminPlan']);

        Route::post('/media', [AdminContentController::class, 'uploadMedia']);
        Route::get('/homepage-settings', [AdminContentController::class, 'homepageSettings']);
        Route::put('/homepage-settings', [AdminContentController::class, 'updateHomepageSettings']);
        Route::get('/news', [AdminContentController::class, 'news']);
        Route::post('/news', [AdminContentController::class, 'storeNews']);
        Route::get('/news/{news}', [AdminContentController::class, 'showNews']);
        Route::put('/news/{news}', [AdminContentController::class, 'updateNews']);
        Route::delete('/news/{news}', [AdminContentController::class, 'destroyNews']);
        Route::get('/events', [AdminContentController::class, 'events']);
        Route::post('/events', [AdminContentController::class, 'storeEvent']);
        Route::get('/events/{event}', [AdminContentController::class, 'showEvent']);
        Route::put('/events/{event}', [AdminContentController::class, 'updateEvent']);
        Route::delete('/events/{event}', [AdminContentController::class, 'destroyEvent']);
        Route::get('/community-posts', [AdminContentController::class, 'community']);
        Route::post('/community-posts', [AdminContentController::class, 'storeCommunity']);
        Route::get('/community-posts/{communityPost}', [AdminContentController::class, 'showCommunity']);
        Route::put('/community-posts/{communityPost}', [AdminContentController::class, 'updateCommunity']);
        Route::delete('/community-posts/{communityPost}', [AdminContentController::class, 'destroyCommunity']);
        Route::get('/opportunities', [AdminContentController::class, 'opportunities']);
        Route::post('/opportunities', [AdminContentController::class, 'storeOpportunity']);
        Route::put('/opportunities/{opportunity}', [AdminContentController::class, 'updateOpportunity']);
        Route::delete('/opportunities/{opportunity}', [AdminContentController::class, 'destroyOpportunity']);
        Route::get('/opportunity-enquiries', [AdminContentController::class, 'enquiries']);
        Route::patch('/opportunity-enquiries/{enquiry}', [AdminContentController::class, 'updateEnquiry']);
        Route::get('/announcements', [AdminContentController::class, 'announcements']);
        Route::post('/announcements', [AdminContentController::class, 'storeAnnouncement']);
        Route::put('/announcements/{announcement}', [AdminContentController::class, 'updateAnnouncement']);
        Route::delete('/announcements/{announcement}', [AdminContentController::class, 'destroyAnnouncement']);
    });
});
