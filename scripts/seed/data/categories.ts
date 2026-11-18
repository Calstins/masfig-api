/**
 * The ten product ranges of the MASFIG catalogue. Names follow the catalogue's own section titles.
 * Nothing here states a price, a capacity or a guarantee that the catalogue does not.
 */
export interface Faq { question: string; answer: string }

export interface SeedCategory {
  /** Section key used by catalog-extracted.json */
  section: string
  slug: string
  name: string
  h1: string
  intro: string
  seoTitle: string
  seoDescription: string
  imageAlt: string
  faqs: Faq[]
  /** First product whose name matches is used for the category image and the hero slide. */
  heroPick: RegExp
  hero: { eyebrow: string; title: string; subtitle: string }
  /** Short audience phrase reused in product SEO titles, e.g. "Bakeries". */
  audience: string
  /** One sentence for product copy: what this range is for. */
  blurb: string
}

const quote = (what: string): Faq => ({
  question: `How do I get a price for ${what}?`,
  answer: `Use the quote form on this page, call us or message us on WhatsApp. Tell us what you need, how many units and where you are, and we reply with availability, delivery and installation details.`,
})
const delivery: Faq = {
  question: 'Do you deliver and install across Nigeria?',
  answer: 'We supply from Lagos and can arrange delivery and installation. Give us your location and site details when you request a quote so we can confirm what is involved.',
}

export const CATEGORIES: SeedCategory[] = [
  {
    section: 'bakery-equipment', slug: 'bakery-equipment', name: 'Bakery Equipment',
    h1: 'Bakery Equipment in Nigeria: Ovens, Mixers & Dough Machines',
    audience: 'Bakeries',
    blurb: 'Equipment for mixing, shaping, baking, cooling and slicing bread, cakes and pastries.',
    heroPick: /^Rotary Oven \(32/i,
    hero: { eyebrow: 'Bakery equipment', title: 'Ovens and dough machines for a busy bakery', subtitle: 'Rotary, deck, convection, pizza and tunnel ovens, spiral and cake mixers, dough dividers, sheeters and slicers, supplied from Lagos.' },
    imageAlt: 'Rotary bakery oven supplied by MASFIG LTD',
    intro: `A bakery is only as consistent as its oven and its dough handling. MASFIG supplies the full production line: rotary, deck, convection, pizza and tunnel ovens, spiral and cake mixers, dough dividers, rounders, moulders and sheeters, bread slicers, cooling racks, baker's racks and weighing scales.

Tell us what you bake, how much you want to produce each day, the space you have and whether you plan to run on gas or electricity. We will help you choose equipment that fits your output and your site, and you can add machines as the bakery grows.

Browse the range below, search for a specific machine, or send a quote request and we will come back with availability and delivery details.`,
    seoTitle: 'Bakery Equipment in Nigeria & Lagos | Ovens, Mixers',
    seoDescription: 'Buy bakery equipment in Nigeria from Lagos: rotary, deck and convection ovens, spiral mixers, dividers, sheeters and slicers. Request a quote from MASFIG.',
    faqs: [
      { question: 'Which bakery machines should a new bakery buy first?', answer: 'Most new bakeries start with an oven, a mixer and a work table, then add a divider, moulder, proofing and slicing equipment as volume grows. Share your product list and daily output and we will suggest a sensible order of purchase.' },
      { question: 'Should I choose a deck oven or a rotary oven?', answer: 'Deck ovens suit smaller batches and a mix of products, while rotary ovens suit high-volume production of the same items. Our guide to choosing an oven explains the trade-offs; you can also ask us for advice based on your menu.' },
      quote('bakery equipment'), delivery,
    ],
  },
  {
    section: 'cooking-equipment', slug: 'cooking-equipment', name: 'Cooking Equipment',
    h1: 'Commercial Cooking Equipment: Gas Cookers, Fryers & Grills',
    audience: 'Restaurants and Caterers',
    blurb: 'Gas and electric cookers, fryers, griddles, grills, rotisseries and shawarma machines for professional kitchens.',
    heroPick: /^8 Burner Gas Cooker/i,
    hero: { eyebrow: 'Cooking equipment', title: 'Cookers, fryers and grills for professional kitchens', subtitle: 'Multi-burner gas cookers with oven, deep and pressure fryers, griddles, rotisseries, shawarma machines and more.' },
    imageAlt: 'Commercial gas cooker with oven supplied by MASFIG LTD',
    intro: `Cooking equipment has to keep up with the busiest hour of service. MASFIG supplies commercial gas and electric cookers with ovens, stock pot burners, griddles, deep and pressure fryers, chicken rotisseries, hot dog and charcoal grills, shawarma machines, popcorn and candy floss machines, boiling pans and pressure pots.

Some items are available as imported units and others as locally fabricated versions in different sizes. Tell us your menu, the number of covers you serve, your gas or power supply and your available floor space, and we will recommend what fits.

Pick a range below or request a quote and we will confirm models, options and delivery.`,
    seoTitle: 'Industrial Kitchen Equipment Nigeria & Lagos | MASFIG',
    seoDescription: 'Industrial and commercial kitchen equipment in Nigeria: gas cookers, fryers, griddles, rotisseries and shawarma machines from Lagos. Request a quote.',
    faqs: [
      { question: 'Should I buy gas or electric cooking equipment?', answer: 'It depends on your fuel supply and power reliability. Many Nigerian kitchens prefer gas cookers and ovens because they keep working when grid power is unstable, while electric units suit sites with a dependable supply. Tell us your situation and we will advise.' },
      { question: 'Do you supply locally fabricated equipment too?', answer: 'Yes. Several items in the range, such as grills, shawarma machines and cookers, are available as locally fabricated units in different sizes as well as imported models. Ask us which suits your budget and workload.' },
      quote('commercial cooking equipment'), delivery,
    ],
  },
  {
    section: 'food-processing', slug: 'food-processing', name: 'Food Processing Equipment',
    h1: 'Food Processing Machines: Juicers, Grinders, Cutters & Mincers',
    audience: 'Food Processors',
    blurb: 'Machines for juicing, grinding, cutting, roasting, mincing and preparing food in volume.',
    heroPick: /^Automatic Citrus Juice Extractor/i,
    hero: { eyebrow: 'Food processing', title: 'Machines that turn raw ingredients into products', subtitle: 'Juice and sugar cane extractors, grinders, blenders, chin chin cutters, groundnut roasters, meat mincers, vegetable cutters and more.' },
    imageAlt: 'Automatic citrus juice extractor supplied by MASFIG LTD',
    intro: `Food processing machines replace slow manual work with consistent, repeatable output. MASFIG supplies juice, citrus, tiger nut and sugar cane extractors, blenders, food processors, wet and dry grinders, chin chin and noodle cutters, groundnut roasters and coating machines, dehydrators, meat mincers, cutters and bone saws, potato peelers, vegetable cutters and vibrating sieves.

If you are starting a small production business or scaling an existing one, tell us what you make and how much you want to produce. We will help you pick machines that suit the product and the volume, and quote them together.

Search the range below or send a quote request.`,
    seoTitle: 'Food Processing Machines Nigeria & Lagos | MASFIG',
    seoDescription: 'Food processing machines in Nigeria: juice extractors, grinders, chin chin cutters, groundnut roasters and meat mincers from Lagos. Get a quote today.',
    faqs: [
      { question: 'Can you recommend machines for a small food production start-up?', answer: 'Yes. Tell us what you want to produce and your target daily volume. We will suggest a short list of machines for the first stage and what to add as demand grows.' },
      { question: 'Do these machines need three-phase power?', answer: 'Power requirements differ by machine. We confirm the electrical or fuel requirement for the specific model when we send your quotation, so you can check it against your site before ordering.' },
      quote('food processing machines'), delivery,
    ],
  },
  {
    section: 'fast-food-equipment', slug: 'fast-food-restaurant-equipment', name: 'Fast Food & Restaurant Equipment',
    h1: 'Fast Food & Restaurant Equipment in Nigeria',
    audience: 'Fast Food Businesses',
    blurb: 'Fryers, warmers, shawarma and grill machines, ice cream machines, display chillers and snack equipment for fast food and restaurants.',
    heroPick: /^Deep Fryer$/i,
    hero: { eyebrow: 'Fast food & restaurant', title: 'Everything to open and run a fast food outlet', subtitle: 'Fryers, food and snack warmers, shawarma machines, ice cream machines, juice dispensers, griddles, waffle and crepe makers and display chillers.' },
    imageAlt: 'Commercial deep fryer for fast food supplied by MASFIG LTD',
    intro: `Fast food runs on speed, so every machine behind the counter has to be quick to heat, easy to clean and ready for repeated use. MASFIG supplies deep and pressure fryers, food and snack warmers, griddles, shawarma toasters and kebab machines, chicken roasters and rotisseries, ice cream and popsicle machines, juice dispensers, pizza machines and work tables, cake chillers, waffle, crepe and pancake makers, popcorn and cotton candy machines, and more.

Tell us what is on your menu and how you plan to serve it, whether that is a shawarma spot, a snack shop, a pizza outlet or an ice cream parlour, and we will help you build a practical equipment list for your counter and kitchen.

Search the range below or request a quote for the full set.`,
    seoTitle: 'Restaurant & Fast Food Equipment Nigeria, Lagos',
    seoDescription: 'Restaurant and fast food equipment in Lagos, Nigeria: fryers, food warmers, shawarma and ice cream machines, display chillers. Request a quote.',
    faqs: [
      { question: 'What equipment do I need to open a fast food outlet?', answer: 'It depends on your menu, but most outlets need cooking equipment such as a fryer or grill, food and snack warmers, refrigeration and a clean preparation surface. Our guide to starting a fast food business lists the equipment by menu type.' },
      { question: 'Can I order a complete set for a new outlet?', answer: 'Yes. Send us your menu and floor space and we will quote a complete set so that the equipment works together in your layout.' },
      quote('fast food equipment'), delivery,
    ],
  },
  {
    section: 'refrigeration', slug: 'refrigeration-equipment', name: 'Refrigeration Equipment',
    h1: 'Commercial Refrigeration: Display Chillers, Freezers & Ice Machines',
    audience: 'Restaurants, Bakeries and Shops',
    blurb: 'Display chillers, fridge/freezers, cake and meat chillers, ice machines and ice cream machines for food businesses.',
    heroPick: /^Standing Cake Chiller/i,
    hero: { eyebrow: 'Refrigeration', title: 'Chillers and freezers that keep your stock fresh', subtitle: 'Display and cake chillers, multi-door fridge/freezers, salad bar and meat chillers, blast chillers, ice machines and ice cream machines.' },
    imageAlt: 'Standing glass cake display chiller supplied by MASFIG LTD',
    intro: `Good refrigeration protects your stock and shows it off. MASFIG supplies display and cake chillers with curved or straight glass, single to six-door fridge/freezers, under-counter units, salad bar and pizza table chillers, meat chillers, blast chillers, wine chillers, juice dispensers, open curtain chillers, island freezers, ice cube and ice flake machines, and ice cream and popsicle machines.

Tell us what you need to chill or freeze, how much space you have and how it will be displayed, and we will recommend suitable units. Because grid power can be unreliable, plan your power supply together with your refrigeration; our guide covers what to ask before you buy.

Search the range below or request a quote.`,
    seoTitle: 'Commercial Refrigeration Nigeria & Lagos | Chillers',
    seoDescription: 'Commercial refrigeration in Nigeria: display chillers, cake chillers, fridge/freezers and ice machines from MASFIG, Lagos. Request a quote for your business.',
    faqs: [
      { question: 'What is the difference between a chiller and a freezer?', answer: 'A chiller keeps products cold for display or short-term storage, while a freezer keeps them frozen. Many units are sold as fridge/freezers that can be set for either. Tell us what you are storing and we will suggest the right type.' },
      { question: 'Can refrigeration run on a generator or inverter?', answer: 'Refrigeration needs a stable supply and a start-up surge. Share the equipment list with your electrician when sizing a generator or inverter; we can confirm the electrical details of each model on request.' },
      quote('commercial refrigeration'), delivery,
    ],
  },
  {
    section: 'kitchen-furniture', slug: 'kitchen-furniture-cabinets', name: 'Kitchen Furniture & Cabinets',
    h1: 'Stainless Steel Kitchen Furniture: Worktables, Sinks & Hoods',
    audience: 'Commercial Kitchens',
    blurb: 'Worktables, sinks, racks, shelves, trolleys, hoods and extractors for commercial kitchens.',
    heroPick: /^Worktable with Splash Back/i,
    hero: { eyebrow: 'Kitchen furniture', title: 'Worktables, sinks and hoods for a clean kitchen', subtitle: 'Stainless worktables, single, double and three-bowl sinks, racks, shelves, trolleys, kitchen hoods and extractor fans.' },
    imageAlt: 'Stainless steel worktable with splash back supplied by MASFIG LTD',
    intro: `A commercial kitchen needs surfaces and storage that are easy to clean and built for daily use. MASFIG supplies stainless worktables with or without splash backs and under-shelves, single, double and three-bowl sinks, wire and chrome shelves, wall shelves, plate racks, bakers racks, trolleys, kitchen hoods, hood extractors and extractor fans.

Many items come in a range of lengths, so measure your space and tell us what you need. We can help you work out a layout that puts preparation, cooking, washing and storage in a sensible order and keeps ventilation where it belongs, above the cooking line.

Browse the range or send a quote request with your measurements.`,
    seoTitle: 'Stainless Kitchen Equipment Nigeria & Lagos | MASFIG',
    seoDescription: 'Stainless steel worktables, sinks, shelves, trolleys, kitchen hoods and extractor fans for Nigerian kitchens, from Lagos. Send measurements for a quote.',
    faqs: [
      { question: 'Can I order a table or hood to my own measurements?', answer: 'Many items are offered in a range of lengths, shown in feet. Send us your measurements and we will confirm what is available or whether a custom size is possible.' },
      { question: 'Where should the kitchen hood go?', answer: 'A hood belongs directly above the cooking line, sized to cover the equipment beneath it, with an extractor to carry heat and fumes out. Send us your layout and we will advise on a suitable hood.' },
      quote('kitchen furniture'), delivery,
    ],
  },
  {
    section: 'supermarket-equipment', slug: 'supermarket-equipment', name: 'Supermarket Equipment',
    h1: 'Supermarket Equipment: Gondola Shelves, Trolleys & Chillers',
    audience: 'Supermarkets and Retail Stores',
    blurb: 'Gondola shelves, checkout counters, baskets, trolleys and display chillers and freezers for supermarkets and shops.',
    heroPick: /^Double Side Gondola Shelf$/i,
    hero: { eyebrow: 'Supermarket equipment', title: 'Shelving, counters and chillers for your store', subtitle: 'Single and double-sided gondola shelves, checkout counters, shopping baskets and trolleys, display chillers and island freezers.' },
    imageAlt: 'Double sided gondola shelf for supermarkets supplied by MASFIG LTD',
    intro: `A supermarket is a display system. Shelving, counters, baskets, trolleys and chillers need to guide customers through the store and keep stock presentable. MASFIG supplies single and double-sided gondola shelves, basket shelves in several colours, heavy duty shelves, check-out table counters, shopping baskets and trolleys, single and multi-door display chillers, open curtain chillers, island freezers and ice cream display freezers.

Whether you are fitting out a mini-mart or a full supermarket, send us your floor plan or the shop dimensions and your product mix. We will help you plan shelf runs, the checkout area and your cold chain together and quote the full set.

Browse the range or request a quote.`,
    seoTitle: 'Supermarket Equipment Nigeria & Lagos | Gondola Shelves',
    seoDescription: 'Supermarket equipment in Nigeria: gondola shelves, checkout counters, trolleys, baskets and display chillers from Lagos. Send your floor plan for a quote.',
    faqs: [
      { question: 'What do I need to fit out a mini supermarket?', answer: 'Most stores need gondola shelving, a checkout counter, baskets or trolleys, and display chillers and freezers for cold goods. Our supermarket equipment guide lists the items in order of priority.' },
      { question: 'Do you supply shelves in different colours and finishes?', answer: 'Some shelves are offered in several colours and finishes. Tell us what you prefer and we will confirm availability when we quote.' },
      quote('supermarket equipment'), delivery,
    ],
  },
  {
    section: 'water-production-packaging', slug: 'water-production-packaging', name: 'Water Production & Packaging Equipment',
    h1: 'Water Production & Packaging Equipment: Sachet, Bottle & Sealers',
    audience: 'Water Producers and Packers',
    blurb: 'Sachet and bottled water production lines, PET blowing machines, water treatment, coding and sealing machines.',
    heroPick: /^Sachet Water Factory Setup/i,
    hero: { eyebrow: 'Water & packaging', title: 'Sachet and bottled water production lines', subtitle: 'Treatment, filling and sealing machines, PET blowers and moulds, coding printers, shrink wrappers and a full range of packaging sealers.' },
    imageAlt: 'Sachet water production setup supplied by MASFIG LTD',
    intro: `Packaged water and packaged food both depend on reliable filling, sealing and coding machines. MASFIG supplies sachet water machines and complete sachet and bottle water factory setups, water treatment including reverse osmosis and stainless treatment tanks, mono block fillers, PET blowing machines, bottle moulds, air compressors, bottle sealing machines, date coding and ink jet printers, shrink wrappers and water chillers.

For general packaging we supply pedal, impulse, band, cup, vacuum and nitrogen sealers, vertical and powder or granular packaging machines, and nylon sealers for bread and luggage.

Producing packaged water also involves regulatory approval; our guide explains the steps to plan for. Browse the range or request a quote for your line.`,
    seoTitle: 'Water Production & Packaging Machines Nigeria, Lagos',
    seoDescription: 'Sachet and bottled water machines, PET blowers, water treatment, coding printers and sealers in Nigeria, from Lagos. Request a quote today.',
    faqs: [
      { question: 'Do you supply a complete sachet water factory setup?', answer: 'Yes. The range includes complete sachet and bottle water setups as well as individual machines for treatment, filling, sealing, coding and wrapping. Tell us your target output and we will quote what you need.' },
      { question: 'Do I need approval to sell packaged water?', answer: 'Packaged water is a regulated food product in Nigeria, and producers register their product and premises with the regulator, NAFDAC. Our guide to starting a water business outlines what to prepare; confirm current requirements with NAFDAC directly.' },
      quote('water production equipment'), delivery,
    ],
  },
  {
    section: 'laundry-equipment', slug: 'laundry-equipment', name: 'Laundry Equipment',
    h1: 'Commercial Laundry Equipment: Washers, Dryers & Ironers',
    audience: 'Hotels and Laundries',
    blurb: 'Commercial washing machines, dryers, combined washer-dryers and ironing machines for hotels and laundry businesses.',
    heroPick: /^Washing Machine$/i,
    hero: { eyebrow: 'Laundry equipment', title: 'Washers, dryers and ironers for busy laundries', subtitle: 'Commercial washing machines, dryers, combined washing and drying machines and ironing machines for hotels and laundry businesses.' },
    imageAlt: 'Commercial washing machine supplied by MASFIG LTD',
    intro: `Hotels, hospitals, schools and laundry businesses need washing and drying equipment that copes with heavy, repeated loads. MASFIG supplies commercial washing machines, dryers, combined washing and drying machines and ironing machines in different types.

Tell us how much laundry you process, whether it is hotel linen, uniforms or customers' clothes, and what space and utilities you have. We will help you choose machines that match your volume and quote them together with delivery and installation details.

Browse the range or request a quote.`,
    seoTitle: 'Commercial Laundry Equipment Nigeria & Lagos | MASFIG',
    seoDescription: 'Commercial washing machines, dryers and ironing machines for hotels and laundries in Nigeria, supplied from Lagos. Request a quote for your business.',
    faqs: [
      { question: 'How do I choose the right washing machine size?', answer: 'Size the machine to your daily volume and peak loads. Tell us how many kilograms of laundry you process per day and we will recommend suitable machines and the number of units.' },
      { question: 'What utilities does a commercial laundry need?', answer: 'Most commercial machines need a water supply, drainage and a power or gas connection. We confirm the requirements of the specific model when we quote so you can prepare the site.' },
      quote('laundry equipment'), delivery,
    ],
  },
  {
    section: 'sound-lighting-stage', slug: 'sound-lighting-stage', name: 'Sound, Lighting & Stage',
    h1: 'Sound, Lighting & Stage Equipment for Events and Venues',
    audience: 'Event Companies and Venues',
    blurb: 'Speakers, amplifiers, stage and truss systems, stage lighting and effects for events, clubs and venues.',
    heroPick: /^4 Acoustic Line Array Speaker/i,
    hero: { eyebrow: 'Sound, lighting & stage', title: 'Sound, lights and staging for unforgettable events', subtitle: 'Line array and full range speakers, amplifier racks, stage and truss systems, parcan and COB lighting, smoke machines and venue effects.' },
    imageAlt: 'Acoustic line array speaker system supplied by MASFIG LTD',
    intro: `Events succeed or fail on sound, light and staging. MASFIG supplies acoustic line array and full range speakers, mobile sound setups with amplifiers, amplifier racks, stages, trussing with lighting or speakers, truss parts, LED parcan, COB, fresnel and table lights, smoke machines, LED message boards, sparklers and bottle-service presentation accessories for clubs and lounges.

Whether you run an event company, a venue, a church or a club, tell us the size of the space, the number of guests and the kind of events you host. We will help you choose a set that fits your venue and your budget.

Browse the range or request a quote.`,
    seoTitle: 'Sound, Lighting & Stage Equipment Nigeria & Lagos',
    seoDescription: 'Line array speakers, mobile sound, stage and truss systems and lights for events and churches in Nigeria, from Lagos. Request a quote.',
    faqs: [
      { question: 'Can you recommend a sound system for my venue?', answer: 'Yes. Tell us the size of the room or outdoor space, the number of guests and the type of events, and we will suggest speakers and amplification that suit it.' },
      { question: 'Do you supply stage and truss systems?', answer: 'Yes. The range includes stages, full stage and truss with canopy, trussing with lights or speakers and the individual truss parts.' },
      quote('sound and lighting equipment'), delivery,
    ],
  },
]
