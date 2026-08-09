<?php

namespace App\Support;

use App\Models\CommunityPost;
use Illuminate\Support\Collection;

class CommunityDemoContent
{
    public static function posts(): array
    {
        return [
            [
                'title' => 'From home studio to growing beauty brand',
                'content' => '<p>A healthy beauty community should make members feel informed, supported, and confident enough to ask practical questions. In this demo story, a home studio owner explains how she moved from occasional referrals to a growing beauty brand by sharing real business decisions with the group. She started with clear service categories, public base pricing, a simple consultation form, accurate location details, and a compact gallery that showed her actual client work instead of only inspiration images. Other members responded with their own pricing lessons, appointment scripts, client-prep messages, and examples of how they ask for reviews without pressuring clients.</p><p>The thread shows the kind of content that keeps a professional community useful: specific context, honest lessons, and replies that add value. Members are encouraged to ask follow-up questions, mention providers who have experience with similar challenges, react to advice that helped them, and share the post with someone who needs it. The discussion also reminds everyone not to post private client photos without consent, not to spam services in unrelated threads, and to report unsafe or misleading advice. A community should help professionals improve their craft, protect clients, and turn shared experience into better standards.</p><h2>What changed</h2><ul><li>Simple service packages made prices easier for clients to understand.</li><li>Prep notes reduced late arrivals, missed details, and appointment stress.</li><li>Portfolio updates made discovery more trustworthy because the images matched real services.</li></ul>',
                'type' => 'story',
                'topic' => 'Business growth',
                'group_name' => 'Studio owners',
                'mentions' => ['amara-glam', 'beautyprohq'],
            ],
            [
                'title' => 'Pro spotlight: building trust through great client care',
                'content' => '<p>This spotlight demonstrates how community content can teach through real examples rather than empty promotion. The featured provider walks members through the client-care system she uses before, during, and after appointments. She explains how she confirms skin sensitivity, hair history, preferred finish, timing, location, payment method, and aftercare needs before the client arrives. The post is detailed enough for other professionals to learn from it, but it also leaves room for discussion: members can ask how to adapt the process for mobile services, bridal work, students, busy salons, and first-time clients who are unsure what to request.</p><p>A strong community gives recognition while still making the conversation useful. In the comments, customers describe what makes them trust a provider, providers compare booking messages, and moderators remind everyone to keep replies respectful and on topic. Reactions help surface the most helpful guidance, replies allow deeper questions, shares let members send the resource to teams, and mentions connect people with relevant experience. This is how a professional community should behave: it celebrates good work, documents repeatable systems, protects clients from confusion, and helps providers raise their service standards without turning every post into an advert.</p><h2>Trust signals that matter</h2><ul><li>Fast replies that confirm service details without sounding rushed.</li><li>Real portfolio images, accurate pricing, and complete location information.</li><li>Aftercare messages that make clients feel supported after the appointment.</li></ul>',
                'type' => 'spotlight',
                'topic' => 'Client experience',
                'group_name' => 'Service providers',
                'mentions' => ['kemi-crowns', 'client-care'],
            ],
            [
                'title' => 'Community win: more beauty professionals getting discovered',
                'content' => '<p>This demo community win shows how a platform community can help members improve visibility in a structured way. Several providers reviewed their public profiles, compared what clients could see at a glance, and made updates based on peer feedback. They added location, city, and country details, uploaded clearer gallery images, included base prices, cleaned up service descriptions, and wrote stronger about sections that explained who they serve. Customers in the thread shared what helped them choose a provider, while experienced providers explained how they balance personality, pricing, availability, and proof of work on a profile.</p><p>The content reflects how a community should support discovery without becoming noisy. Members can share a profile update, ask for one focused piece of feedback, react to useful advice, reply with examples, and mention someone who knows the topic. Groups keep the discussion organized, topics make it searchable, and rules keep the space professional. Moderators can remove spam, members can report suspicious posts, and everyone is reminded not to publish private client details. The best community conversations turn individual improvements into shared learning, so one person updating a profile also helps many other professionals understand what a clear, client-ready profile should include.</p><h2>Member actions</h2><ul><li>Upload up to six relevant portfolio images that show real work clearly.</li><li>List service categories, base price, city, country, and booking expectations.</li><li>Ask for feedback that is specific enough for members to answer well.</li></ul>',
                'type' => 'community',
                'topic' => 'Discovery',
                'group_name' => 'General',
                'mentions' => ['beautyprohq', 'profile-review'],
            ],
            [
                'title' => 'Help thread: getting better client enquiries',
                'content' => '<p>This help thread models the kind of detailed conversation that keeps members returning to a community. A newer provider explains that many client enquiries arrive with only one sentence, no date, no location, no budget, and no reference image. Instead of giving vague advice, the community breaks the problem into a practical enquiry flow. Members suggest a short reply template, a booking checklist, a way to ask for inspiration photos, a polite pricing response, and a reminder to confirm whether the client wants mobile service, studio service, or virtual consultation. The thread also shows how to answer budget questions without sounding defensive.</p><p>A good community should make help easy to find and safe to participate in. Categories separate help topics from announcements and spotlights, groups let new providers learn from experienced professionals, comments allow members to compare scripts, and replies keep specific questions attached to the right answer. Reactions show which advice is most useful, shares move resources to teams or apprentices, mentions bring in people with relevant experience, and reports protect the space when something looks like spam, harassment, or unsafe guidance. This demo post gives members a standard for clear, constructive help: explain the situation, ask one focused question, protect client privacy, and thank people who contribute practical answers.</p><h2>Discussion prompts</h2><ul><li>What questions do you ask every new client before confirming a booking?</li><li>How do you answer budget questions while keeping your boundaries clear?</li><li>Which details reduce no-shows, late arrivals, and mismatched expectations?</li></ul>',
                'type' => 'help',
                'topic' => 'Help',
                'group_name' => 'New providers',
                'mentions' => ['new-providers', 'booking-flow'],
            ],
        ];
    }

    public static function rules(): array
    {
        return [
            'Be respectful and constructive.',
            'Keep replies relevant to the topic.',
            'Do not share private client information or spam promotions.',
            'Report unsafe, misleading, or abusive content.',
        ];
    }

    public static function seedInteractions(CommunityPost $post, Collection $members, int $index, bool $includeReports = true): void
    {
        $members = $members->filter()->unique('id')->values();

        foreach ($members->take(4) as $offset => $member) {
            $post->reactions()->updateOrCreate(
                ['user_id' => $member->id],
                ['type' => ['like', 'love', 'helpful', 'celebrate'][($index + $offset) % 4]]
            );
        }

        $commentBodies = [
            'This is the type of discussion I expect from a serious professional community. The original post gives enough context for members to understand the challenge, and the replies can focus on practical steps instead of guessing. I especially like that the advice includes pricing clarity, client privacy, and examples that newer providers can adapt.',
            'From a customer point of view, complete profiles and honest communication make a big difference. When I can see location, price range, photos, and what to expect before I message a provider, the conversation feels easier. Communities can help by showing providers what clients actually look for before booking.',
            'I would add that moderators should keep threads organized by topic and group. Helpful posts should stay visible, repeated spam should be removed, and members should be encouraged to report anything unsafe. That makes it easier for serious providers and customers to trust the space.',
        ];
        $replyBodies = [
            'Agreed. A simple checklist would help many providers answer enquiries faster while still sounding personal.',
            'This is why examples matter. A template, a real scenario, and a respectful comment thread teach more than a short announcement.',
            'The report option is important too. Good moderation protects the useful conversations and keeps the community professional.',
        ];

        foreach ($commentBodies as $commentIndex => $body) {
            $member = $members->get(($index + $commentIndex) % max($members->count(), 1));
            if (! $member) {
                continue;
            }

            $comment = $post->comments()->updateOrCreate(
                ['user_id' => $member->id, 'parent_id' => null, 'body' => $body],
                ['mentions' => $commentIndex === 0 ? ['beautyprohq'] : [], 'status' => 'visible']
            );

            $replyMember = $members->get(($index + $commentIndex + 1) % max($members->count(), 1));
            if ($replyMember && $replyMember->id !== $member->id) {
                $post->comments()->updateOrCreate(
                    ['user_id' => $replyMember->id, 'parent_id' => $comment->id, 'body' => $replyBodies[$commentIndex]],
                    ['mentions' => [], 'status' => 'visible']
                );
            }
        }

        if ($shareMember = $members->get(($index + 3) % max($members->count(), 1))) {
            $post->shares()->updateOrCreate(
                ['user_id' => $shareMember->id, 'channel' => 'copy_link'],
                ['ip_hash' => null]
            );
        }

        if ($includeReports && $index === 3 && ($reportMember = $members->last())) {
            $post->reports()->updateOrCreate(
                ['user_id' => $reportMember->id, 'reason' => 'Demo moderation review'],
                ['details' => 'Demo report showing how members can flag spam, unsafe advice, harassment, or content that breaks community rules.', 'status' => 'reviewing']
            );
        }

        $post->forceFill([
            'reaction_count' => $post->reactions()->count(),
            'comment_count' => $post->comments()->visible()->count(),
            'share_count' => $post->shares()->count(),
            'report_count' => $post->reports()->count(),
        ])->save();
    }
}
