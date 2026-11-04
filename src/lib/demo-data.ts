import type { TurnNode } from './types';

export const DEMO_NODES: Record<string, TurnNode> = {
  'demo-1': {
    id: 'demo-1',
    parentId: null,
    kind: 'main',
    title: 'Cat Sanctuary Concept',
    user: 'Hi Mochi! I want to open a cozy Japanese kissaten & cat sanctuary in Kyoto. What should our overall concept and aesthetic be?',
    assistant: `Konnichiwa! 🌸 That sounds like a magical haven! A modern Kissaten (喫茶店) combined with a rescue cat sanctuary would be incredible. Here is a cohesive concept:

**Theme: 'Neko no Niwa' (Cat's Garden) 🐾**
1. **Warm Natural Materials**: Light hinoki wood furniture, tatami sitting platforms, warm 2700K rice-paper lanterns.
2. **Cat Enrichment Architecture**: High catwalks seamlessly integrated into ceiling beams, felt scratching pillars, and glass viewing bridges.
3. **Retro Nostalgia**: Showa-era glassware, vintage jazz playing on vinyl, and seasonal drip coffee.`,
    summary: "Defined 'Neko no Niwa' concept combining retro Kissaten aesthetic with integrated cat walkways and vintage jazz.",
    status: 'done',
    createdAt: 1730700000000,
  },
  'demo-2': {
    id: 'demo-2',
    parentId: 'demo-1',
    kind: 'main',
    title: 'Acoustic & Seating Zoning',
    user: 'I love the tatami platforms! How should we zone the space so customers who want to work with laptops are separated from playful kittens?',
    assistant: `Great ergonomics question! 🐾 Let's create **three gentle acoustic zones**:

1. **The Engawa Veranda (Quiet / Laptop Zone)**: Raised wooden perimeter benches, power outlets disguised in bamboo boxes, low-stimulation cats (seniors) who love snoozing.
2. **The Sunlit Play Yard (Active Kitten Zone)**: Central sunken pit with washable linen cushions, suspended rope bridges, feather wands.
3. **The Kitchen / Counter Bar (Human-Only Zone)**: Glass partition meeting Kyoto sanitation standards, siphon coffee bar with view of cats.`,
    summary: 'Split into 3 zones: Engawa work veranda, Sunlit kitten play yard, and glass-partitioned siphon bar.',
    status: 'done',
    createdAt: 1730700060000,
  },
  'demo-3': {
    id: 'demo-3',
    parentId: 'demo-2',
    kind: 'side',
    title: 'Rescue Cat Welfare',
    user: 'Wait, what cat breeds or rescue policies are best? We really want to prioritize rescue cats rather than purebreds.',
    assistant: `That warms my heart! 💖 Partnering with Kyoto animal welfare shelters creates true purpose:

- **Rescue Partnership**: Feature adoptable mixed-breed rescue cats (Neko-chan profiles with cute nametags!).
- **Health & Quarantine Room**: A visible, glass-walled vet nook for new arrivals.
- **Staffing**: 1 dedicated feline behaviorist on duty to monitor stress cues.`,
    summary: 'Established shelter partnership policy, quarantine room with visibility, and dedicated feline behaviorist.',
    status: 'done',
    pin: 'Rescue shelter partnership + dedicated behaviorist required',
    createdAt: 1730700120000,
  },
  'demo-4': {
    id: 'demo-4',
    parentId: 'demo-3',
    kind: 'side',
    title: 'Adoption Onboarding Flow',
    user: 'What should the adoption onboarding workflow look like for visitors who fall in love with a cat?',
    assistant: `Here is a safe, heartwarming 3-step adoption flow: 📝

1. **Two-Visit Rule**: Visitors interact at least twice across different days to ensure genuine bond.
2. **Home Environment Checklist**: Screening for secure windows, balustrades, and vet readiness.
3. **Graduation Ceremony**: When approved, the cat receives a farewell Polaroid on the cafe's 'Happy Tails' memory wall!`,
    summary: 'Created a 3-step adoption procedure: 2-visit trial, home checklist, and farewell graduation board.',
    status: 'done',
    createdAt: 1730700180000,
  },
  'demo-5': {
    id: 'demo-5',
    parentId: 'demo-2',
    kind: 'main',
    title: 'Signature Menu',
    user: 'Now let\'s plan the drink & dessert menu. What signature Kissaten items should we serve?',
    assistant: `Here is a menu that will make foodies and cat lovers swoon! 🍵✨

- **Mount Fuji Cream Soda**: Blue melon or butterfly pea syrup topped with vanilla ice cream and a maraschino cherry.
- **Purr-fect Fluffy Souffle Pancakes**: 3-inch high jiggly Japanese pancakes branded with a paw print stencil.
- **Ceremonial Uji Matcha Latte**: Whisked table-side with oat milk and flower foam art.
- **Neko Shokupan Toast**: Cat-shaped Japanese milk bread toasted with sweet azuki red bean paste and salted butter.`,
    summary: 'Curated Showa retro menu: Fuji cream sodas, jiggly souffle pancakes, table-side Uji matcha, and neko shokupan.',
    status: 'done',
    createdAt: 1730700240000,
  },
  'demo-6': {
    id: 'demo-6',
    parentId: 'demo-5',
    kind: 'side',
    title: 'Cat Dining Safety',
    user: 'How do we prevent cats from sneaking a lick of dairy or sugar from customers\' plates?',
    assistant: `Super important safety measure! ⚠️

- **Protective Glass Cloches**: All pastries delivered to tables under clear acrylic domes.
- **Cat-Friendly Alternatives**: Offer a $2 'Cat Cappuccino' (frothed lactose-free goat's milk with catnip sprinkles) so cats have their own treat!
- **Laminated Table Etiquette Cards**: Cute illustrated manga strips showing 'Do not feed humans\' snacks to kitties'.`,
    summary: 'Implemented food acrylic cloches, $2 goat-milk catuccinos, and manga etiquette cards.',
    status: 'done',
    pin: 'Acrylic cloches for human food & $2 goat-milk cat treats',
    createdAt: 1730700300000,
  },
  'demo-7': {
    id: 'demo-7',
    parentId: 'demo-5',
    kind: 'main',
    title: 'Reservation & Ticketing',
    user: 'What reservation and ticketing system should we use to avoid long lines outside?',
    assistant: `To preserve peaceful serenity for cats and guests:

- **Timed Entry Slots**: 60-minute or 90-minute reservations via web app with line-up deposit.
- **Walk-in QR Waitlist**: Line messaging bot lets customers explore nearby Kyoto shrines until their table is ready.
- **Max Occupancy Cap**: Strictly 15 humans at any time to guarantee low feline sensory stress.`,
    summary: 'Configured 60/90-min online timed slots, Line QR waitlist, and strict 15-person visitor cap.',
    status: 'done',
    createdAt: 1730700360000,
  },
  'demo-8': {
    id: 'demo-8',
    parentId: 'demo-7',
    kind: 'main',
    title: 'Grand Opening Roadmap',
    user: 'Let\'s summarize our launch checklist for the grand opening month!',
    assistant: `Here is your **Grand Opening Roadmap**! 🎉🌸

- **Week -4**: Soft launch with Kyoto shelter volunteers and feline behaviorists.
- **Week -2**: Local press and food influencer preview night featuring Fuji Cream Sodas.
- **Week 1 (Opening Day)**: Ribbon cutting with commemorative Neko pins for the first 100 guests!

You're ready to build an unforgettable Kyoto landmark!`,
    summary: '4-week launch timeline: soft volunteer test, press preview night, and commemorative pin giveaway opening.',
    status: 'done',
    createdAt: 1730700420000,
  },
  'demo-9': {
    id: 'demo-9',
    parentId: 'demo-8',
    kind: 'side',
    title: 'Opening Day Playlist',
    user: 'What music playlist should we stream on Spotify for opening day?',
    assistant: `Cozy Lo-Fi beats mixed with gentle bossa nova and classic 1970s Japanese City Pop (Taeko Onuki, Tatsuro Yamashita)! It keeps cats relaxed while giving humans vintage Kyoto vibes. 🎶`,
    summary: 'Recommended Japanese City Pop and acoustic bossa nova playlist for ambient relaxation.',
    status: 'done',
    createdAt: 1730700480000,
  },
};
