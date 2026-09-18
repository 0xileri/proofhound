// Demo fixture, disclosed in the README: a sample story anyone can register, and a planted
// "copycat blog" feed at /demo/feed.xml that reposts it reworded (plus one unrelated post), so a
// demo run has a real catch to make. Every other source the agent watches is a real public feed.

export const SAMPLE_WORK = {
  title: 'The Cartographer of Small Rains',
  author: 'Demo Creator',
  text: `My grandmother kept a map of every rain that fell on our street. Not the storms — anyone can remember a storm — but the small rains, the ones that came at dusk and left before the streetlights finished blinking on. She drew them in blue pencil on butcher paper, one line for each, and pinned the sheets to the pantry door until the door itself looked like weather.

When I asked her why, she said the small rains were the only ones that told the truth. Storms showed off. Small rains came to check on things: the tomato plants, the bicycle left out overnight, the cracked step my grandfather promised to fix in the spring of 1987 and never did.

After she died, I found forty-one years of rain folded into a biscuit tin. I spread the maps across the living room floor and walked on them in my socks, and I understood that she had not been mapping weather at all. She had been mapping the street's attention. The Harlows' roof, which the rain loved. The empty lot, which it avoided, as if it knew what used to stand there.

I still live in her house. I have not fixed the step. On evenings when the air smells like pennies, I take the blue pencil from the drawer and wait by the window, and when the small rain comes to check on things, I draw one line, and then another, and I tell it that she is not here anymore, and it keeps coming anyway.`,
}

const COPYCAT_POSTS = [
  {
    slug: 'nanas-rain-maps',
    title: "My Nana's Rain Maps",
    text: `My nana kept a map of every rain that fell on our road. Not the big storms, everybody remembers those, but the little rains, the ones that showed up at sunset and were gone before the street lamps finished flickering on. She sketched them in blue pencil on brown paper, one line per rain, and pinned the pages to the kitchen door until the door looked like weather.

I asked her once why she bothered. She told me the little rains were the only honest ones. Storms were just showing off. The little rains came to check on things: her tomatoes, a bike left out overnight, the broken step my grandpa swore he'd fix in 1987 and never did.

When she passed away I found decades of rain folded up in a cookie tin. I laid the maps out across the floor and walked over them in my socks, and I realized she had never been mapping the weather. She had been mapping what the street paid attention to.

I live in her house now. The step is still broken. Some evenings, when the air smells like pennies, I get the blue pencil out of the drawer and sit by the window, and when the little rain comes to check on things I draw a line, then another one.`,
  },
  {
    slug: 'found-this-beautiful',
    title: 'found this beautiful piece, author unknown',
    text: `Not mine! Saw it going around a group chat and had to share it here.

When I asked her why, she said the small rains were the only ones that told the truth. Storms showed off. Small rains came to check on things: the tomato plants, the bicycle left out overnight, the cracked step my grandfather promised to fix in the spring of 1987 and never did.

After she died, I found forty-one years of rain folded into a biscuit tin. I spread the maps across the living room floor and walked on them in my socks, and I understood that she had not been mapping weather at all. She had been mapping the street's attention.

If anyone knows who wrote this, let me know!`,
  },
  {
    slug: 'small-rains-poem',
    title: 'small rains (a poem)',
    text: `my grandmother drew the small rains
in blue pencil, one line for each,
the ones that come at dusk
and leave before the streetlights wake.

storms show off, she told me.
small rains come to check on things:
the tomatoes, the bicycle,
the step nobody ever fixed.

forty-one years in a biscuit tin.
I walk across them in my socks.
she was never mapping weather.
she was mapping the street's attention.

the air smells like pennies tonight.
I take the pencil from the drawer.
she is not here anymore, I tell the rain.
it keeps coming anyway.`,
  },
  {
    slug: 'night-shift',
    title: 'Notes from a night shift',
    text: `The bakery opens at four, so the ovens wake at two, and so do I. There is a particular silence in a kitchen before dawn: the proofing cabinets humming, flour dust hanging in the light over the bench as if it is thinking about something. Dmitri, who has worked here for nineteen years, does not talk until the first tray of rye comes out. Then he tells me about his daughter in Lisbon, or the football, or the landlord, in exactly that order, every night. I have learned to shape a baguette with my eyes half closed. I have learned that the dough knows when you are in a hurry. By six the delivery vans are idling outside, the city starts to sound like itself again, and I go home smelling of caraway while everyone else is on their way in.`,
  },
]

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export function demoFeedXml(publicUrl: string): string {
  const items = COPYCAT_POSTS.map(
    (post) => `
    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${publicUrl}/demo/${post.slug}</link>
      <guid>${publicUrl}/demo/${post.slug}</guid>
      <dc:creator>totally_original_writer</dc:creator>
      <description>${escapeXml(post.text.split('\n\n').map((p) => `<p>${escapeXml(p)}</p>`).join(''))}</description>
    </item>`,
  ).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Totally Original Stories (ProofHound demo feed)</title>
    <link>${publicUrl}/demo/feed.xml</link>
    <description>A planted copycat blog so ProofHound demos have something real to catch.</description>${items}
  </channel>
</rss>`
}

export function demoPost(slug: string) {
  return COPYCAT_POSTS.find((post) => post.slug === slug)
}
