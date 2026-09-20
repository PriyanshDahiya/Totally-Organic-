// The standard a card has to hit. Hand-written for Indian D2C brands, in
// the shapes that actually run on Reels. The model sees a rotating sample
// (a fixed list would make every card sound the same) and copies the shape,
// never the words.
//
// What they have in common: a time, a place, a number, or someone talking.
// Never a summary of a problem.

export type HookExample = { style: "meme" | "story" | "branded"; lines: string[] };

export const HOOK_EXAMPLES: HookExample[] = [
  // Meme: a moment that stands on its own, brand only in the caption.
  { style: "meme", lines: ["POV: you told yourself you'd post one Reel a day", "it's day 4", "you've posted zero Reels and three stories of your packaging"] },
  { style: "meme", lines: ["when you try to skip leg day but your jeans still remember"] },
  { style: "meme", lines: ["me: I'll just check one order", "me 40 minutes later, replying to a DM about a product I discontinued in March"] },
  { style: "meme", lines: ["nobody:", "my skin at 11pm after I promised myself an early night:"] },
  { style: "meme", lines: ["tell me you run a D2C brand without telling me:", "your camera roll is 400 photos of the same bottle at slightly different angles"] },
  { style: "meme", lines: ["things that just make sense:", "chai at 4", "a shower that takes 6 minutes", "not thinking about your hair once all day"] },
  { style: "meme", lines: ["mummy: beta shaadi mein kya lagayega", "me: normal face wash", "mummy: (silence that lasted 3 business days)"] },
  { style: "meme", lines: ["me after one meeting: I'll reply to that tomorrow", "the email, in my head, at 2am:"] },
  { style: "meme", lines: ["kiss marry kill:", "the 12-step routine", "the 3-step one that actually happens", "the one you bought in a sale and never opened"] },
  { style: "meme", lines: ["what people think my mornings look like: sunlight, journaling, cold water", "what they actually look like: 3 alarms and chai on an empty stomach"] },
  { style: "meme", lines: ["the audacity of my skin to break out the week of a wedding"] },
  { style: "meme", lines: ["red flag: your last Reel was 23 days ago", "green flag: you don't remember the last time you filmed one"] },
  { style: "meme", lines: ["unpopular opinion: you don't need 9 products", "you need the 2 you'll actually use at 11pm"] },
  { style: "meme", lines: ["bhai ne bola 'bas 10 minute mein ready'", "40 minutes later, still deciding what to wear"] },
  { style: "meme", lines: ["it's giving: ₹2,000 skincare, ₹40 sleep schedule"] },
  { style: "meme", lines: ["my bank account watching me buy a fourth face wash 'for travel'"] },
  { style: "meme", lines: ["when the gym trainer says 'last set' for the third time"] },
  { style: "meme", lines: ["the group chat at 11:47pm: 'kal se gym pakka'", "the group chat at 7am:"] },
  { style: "meme", lines: ["POV: monsoon hits Mumbai and your hair has opinions about it"] },
  { style: "meme", lines: ["me explaining to my CA why 'content' is a business expense"] },
  { style: "meme", lines: ["how it started: one clean shelf", "how it's going: 14 bottles, 3 of them empty"] },
  { style: "meme", lines: ["nobody talks about the 9pm decision: shower now, or shower tomorrow and lie about it"] },
  { style: "meme", lines: ["the office AC and my skin have been fighting since Monday"] },
  { style: "meme", lines: ["when your order arrives before the guilt does"] },

  // Story: first person, ends with the brand as the thing that fixed it.
  { style: "story", lines: ["I spent ₹38k on an agency last quarter.", "12 Reels. two of them were good.", "now I paste my store link and keep the ones that sound like my customers.", "₹75 a video. I'm not going back."] },
  { style: "story", lines: ["I used to keep three face washes on the shelf and still grab soap at 7am.", "then I kept one that takes 10 seconds.", "it's the only one that's ever finished."] },
  { style: "story", lines: ["my mum asked why I keep buying 'the same white bottle'.", "she's right, I did, four times.", "the fifth one I actually finished."] },
  { style: "story", lines: ["day 1: bought it because of a Reel", "day 14: it's the only thing I've kept on the shelf", "day 30: my brother stole it"] },
  { style: "story", lines: ["I said I'd post daily. I lasted six days.", "now three posts show up before my chai does and I just pick one."] },
  { style: "story", lines: ["the gym part was fine. smelling like the gym for the rest of the day wasn't.", "one wash between the gym and the metro fixed it."] },
  { style: "story", lines: ["I kept it in the drawer for a month because it looked too nice to use.", "used it once before a wedding.", "it's on the shelf now, half empty."] },
  { style: "story", lines: ["a customer wrote 'bhai actually kaafi acha hai' in a review.", "that one line sold more than everything I wrote that month."] },
  { style: "story", lines: ["I filmed 40 minutes of footage for a 12 second Reel.", "posted it. 212 views.", "now I write the line first and shoot nothing."] },
  { style: "story", lines: ["I ignored it for weeks because everything says 'dermatologist tested'.", "used it for 10 days.", "my mum noticed before I did."] },

  // Branded meme: the brand is part of the joke or the payoff.
  { style: "branded", lines: ["when your whole marketing team is one store link and a laptop"] },
  { style: "branded", lines: ["agency: ₹45,000 for 12 Reels", "me: that's six months of my ad budget", "agency: they'll be very aesthetic", "me: my customers are on the metro, bhai"] },
  { style: "branded", lines: ["me at 7:02am, fully ready, because the routine is two steps now"] },
  { style: "branded", lines: ["POV: your Sunday content day is now a chai break"] },
  { style: "branded", lines: ["they asked which salon.", "it was a ₹399 bottle and nine minutes."] },
  { style: "branded", lines: ["how it's going: my 'content team' is me, a store link, and three posts already waiting"] },
  { style: "branded", lines: ["the shortest gap between 'I should post something' and posting something"] },
  { style: "branded", lines: ["me after switching, watching my old 12-step routine gather dust"] },
  { style: "branded", lines: ["boss: can we get a Reel by evening", "me, who already has three:"] },
  { style: "branded", lines: ["the only thing on my desk that's ever finished a job on time"] },
  { style: "branded", lines: ["when the founder, the marketer and the editor are all you", "and two of them just got replaced by a store link"] },
  { style: "branded", lines: ["my morning: chai, three posts to pick from, and no one asking for a 'quick revision'"] },
  { style: "branded", lines: ["what I told my team: we're hiring a content person", "what actually happened:"] },
  { style: "branded", lines: ["still cheaper than the ₹45k quote, still faster than the 12 meetings"] },
  { style: "branded", lines: ["me explaining to my old editor why the invoice stopped coming"] },
  { style: "branded", lines: ["the 'we'll start posting next month' era is officially over in this house"] },
];

// A varied handful for one card: the right style first, plus a couple of
// others so the model sees range without the prompt getting long.
export function exampleHooks(style: "meme" | "story" | "branded", count = 5) {
  const shuffle = <T,>(xs: T[]) => [...xs].sort(() => Math.random() - 0.5);
  const same = shuffle(HOOK_EXAMPLES.filter((e) => e.style === style)).slice(0, Math.ceil(count * 0.7));
  const other = shuffle(HOOK_EXAMPLES.filter((e) => e.style !== style)).slice(0, count - same.length);
  return shuffle([...same, ...other])
    .map((e) => `- ${e.lines.join(" / ")}`)
    .join("\n");
}
