// Hand-picked seed set for trending_clips, used until the trend-data source
// (lib/trend-source.ts) exists. Each row is a hook STRUCTURE that keeps
// recurring on Reels/TikTok, written out as one concrete example so the remix
// prompt can see its rhythm. These are not copies of specific posts, so
// source_url is a stable "seed:" id rather than a link, and views is null.
//
// niche_tags: "general" hooks work for any brand; the rest only match brands
// whose niche_tags overlap.

export type SeedClip = {
  id: string;
  format: "wall_of_text" | "slideshow";
  niche_tags: string[];
  hook_text: string;
};

export const SEED_CLIPS: SeedClip[] = [
  // Wall of Text, general --------------------------------------------------
  { id: "pov-finally", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "POV: you finally found the one thing that fixed the problem you complained about for 3 years" },
  { id: "nobody-talks-about", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "nobody talks about how exhausting it is to plan every single meal of the week" },
  { id: "me-at-10pm-vs-6am", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "me at 10pm: tomorrow I'm waking up at 6 and changing my life\nme at 6am:" },
  { id: "tell-me-without-telling-me", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "tell me you work from home without telling me you work from home" },
  { id: "that-one-friend", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "every friend group has that one person who has an opinion on everyone's skincare" },
  { id: "unpopular-opinion", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "unpopular opinion: you don't need 12 steps, you need 3 that you actually do" },
  { id: "if-you-do-x-this-is-for-you", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "if you always run late in the morning, this is your sign" },
  { id: "things-i-stopped-buying", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "things I stopped wasting money on after turning 25" },
  { id: "how-it-started-going", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "how it started: \"I'll just try it once\"\nhow it's going: I've told 14 people about it" },
  { id: "red-flag-green-flag", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "red flag: he has one bar of soap for his face, body and hair" },
  { id: "i-was-today-years-old", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "I was today years old when I found out I've been doing this wrong my whole life" },
  { id: "the-audacity", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "the audacity of my body to need water, sleep AND vegetables" },
  { id: "normalize", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "can we normalize not having your whole life figured out by 30" },
  { id: "main-character", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "main character energy is walking out of the house smelling this good" },
  { id: "worst-part-about", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "the worst part about starting over every January is losing all the progress you could've made" },
  { id: "kiss-marry-kill", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "kiss marry kill\n- instant noodles\n- skipping breakfast\n- actually meal prepping" },
  { id: "pov-costs-less", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "POV: it costs less than what you were paying before and it still feels made for you" },
  { id: "i-miss", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "I miss when I didn't have to think about any of this. then I found something that does it for me" },
  { id: "what-they-think-vs-reality", format: "wall_of_text", niche_tags: ["general"],
    hook_text: "what people think I do: sleep in\nwhat I actually do: 4 alarms and a panic" },

  // Wall of Text, niche ----------------------------------------------------
  { id: "gym-leg-day", format: "wall_of_text", niche_tags: ["fitness", "gym", "workout"],
    hook_text: "skipping leg day because I \"didn't have time\" and then scrolling for 2 hours" },
  { id: "gym-first-day", format: "wall_of_text", niche_tags: ["fitness", "gym", "workout"],
    hook_text: "first day at the gym and I'm pretending I know what this machine does" },
  { id: "skincare-routine-honest", format: "wall_of_text", niche_tags: ["skincare", "beauty"],
    hook_text: "my skincare routine on Instagram vs my skincare routine at 1am" },
  { id: "grooming-bathroom-shelf", format: "wall_of_text", niche_tags: ["grooming", "men", "shaving"],
    hook_text: "guys will own one razor for 4 years and call it a routine" },
  { id: "coffee-before-talk", format: "wall_of_text", niche_tags: ["coffee", "beverage", "food"],
    hook_text: "please do not perceive me before my first coffee" },
  { id: "snack-label-reading", format: "wall_of_text", niche_tags: ["food", "snacks", "health", "nutrition"],
    hook_text: "reading the back of a \"healthy\" snack like it's a horror novel" },
  { id: "outfit-nothing-to-wear", format: "wall_of_text", niche_tags: ["fashion", "apparel", "clothing"],
    hook_text: "a wardrobe full of clothes and absolutely nothing to wear" },
  { id: "tech-battery-anxiety", format: "wall_of_text", niche_tags: ["tech", "electronics", "audio"],
    hook_text: "the fear when your earbuds say \"battery low\" 10 minutes into the commute" },

  // Slideshow --------------------------------------------------------------
  { id: "things-i-wish-i-knew", format: "slideshow", niche_tags: ["general"],
    hook_text: "3 things I wish I knew before I started taking my routine seriously" },
  { id: "rating-everything-tried", format: "slideshow", niche_tags: ["general"],
    hook_text: "rating every product I've tried this year, honestly" },
  { id: "things-that-just-make-sense", format: "slideshow", niche_tags: ["general"],
    hook_text: "things that just make sense" },
  { id: "signs-you-need", format: "slideshow", niche_tags: ["general"],
    hook_text: "signs you need to upgrade your morning routine" },
  { id: "starter-pack", format: "slideshow", niche_tags: ["general"],
    hook_text: "the \"I have my life together\" starter pack" },
  { id: "gift-guide-for-him", format: "slideshow", niche_tags: ["gifting", "grooming", "men", "fashion"],
    hook_text: "gifts he'll actually use (not another wallet)" },
  { id: "under-500", format: "slideshow", niche_tags: ["general"],
    hook_text: "things under ₹500 that feel way more expensive" },
];
