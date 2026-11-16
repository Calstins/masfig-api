/**
 * Turns one catalogue entry into a full product record: summary, description, applications, FAQs, SEO fields.
 *
 * Rules: say what the machine IS and what it is USED FOR (general, true of the machine type). Never state a capacity,
 * power rating, dimension, material, brand, price or guarantee the catalogue does not give. Specifications are
 * "confirmed on quotation".
 */
import type { SeedCategory, Faq } from './categories.js'

export interface Extracted { name: string; section: string; pages: number[]; images: string[]; variants: string[]; options: string[] }

interface Kind { re: RegExp; what: string; uses: string[]; ask: string[] }

const K = (re: RegExp, what: string, uses: string[], ask: string[]): Kind => ({ re, what, uses, ask })

/** Order matters: first match wins, so specific rules come before general ones. */
const KINDS: Kind[] = [
  K(/rotary oven/i, 'A rotary oven bakes trays on a rack that turns inside the baking chamber, so every tray is exposed to the same heat. It is built for steady, high-volume baking of bread and other products.', ['Bread bakeries', 'Wholesale and supply bakeries', 'Pastry and snack production'], ['Daily output and number of trays per bake', 'Gas or electric supply at the site', 'Floor space and door access for delivery']),
  K(/deck.*oven|\d deck/i, 'A deck oven bakes on separate decks, each loaded with trays. It suits bakeries that bake a mix of products and want to load and unload in smaller batches.', ['Small and medium bakeries', 'Bread, cakes and pastries', 'Cafes and restaurants that bake in-house'], ['Number of decks and trays you need', 'Gas or electric supply', 'Space and ventilation for the oven']),
  K(/tunnel oven/i, 'A tunnel oven carries products through a heated chamber on a belt, so baking runs continuously rather than in batches.', ['Large-scale bakeries', 'Continuous production lines'], ['Hourly output you need', 'Product size and shape', 'Available floor length and power or gas supply']),
  K(/pizza oven/i, 'A pizza oven is made for baking pizza at the high, steady temperatures that give a crisp base.', ['Pizzerias', 'Restaurants and cafes', 'Fast food outlets'], ['Number of pizzas per hour', 'Gas or electric supply', 'Counter or floor space']),
  K(/convention oven|convection oven/i, 'A convection oven circulates hot air with a fan for even baking, which suits cakes, cookies and pastries as well as roasting.', ['Cake and pastry shops', 'Restaurants and hotels', 'Small bakeries'], ['Number of trays', 'Power supply', 'Where the oven will stand']),
  K(/gas oven/i, 'A gas oven bakes and roasts using gas, which keeps working when grid power is unreliable.', ['Bakeries', 'Restaurants and caterers'], ['Number of decks or trays', 'Gas type and supply', 'Ventilation at the site']),
  K(/spiral mixer/i, 'A spiral mixer kneads dough with a spiral hook turning in a rotating bowl. It develops dough evenly and is the usual choice for bread dough.', ['Bread bakeries', 'Pizza dough preparation'], ['Dough weight per batch', 'Three-phase or single-phase power', 'Batches per day']),
  K(/cake mixer|planetary/i, 'A cake mixer turns a beater through a fixed bowl to mix batter, cream and light doughs.', ['Cake and pastry bakeries', 'Confectionery'], ['Bowl size in litres', 'Products you will mix', 'Power supply']),
  K(/dough sheeter/i, 'A dough sheeter rolls dough into an even sheet of the thickness you set, saving hand rolling and giving consistent pastry.', ['Pastry and pie makers', 'Pizza and flatbread production', 'Snack makers'], ['Table-top or standing type', 'Roller width', 'Products you will sheet']),
  K(/dough divider/i, 'A dough divider cuts a large piece of dough into equal portions, so every loaf or bun starts at the same weight.', ['Bread bakeries', 'Bun and roll production'], ['Automatic or manual type', 'Number of cuts', 'Portion weight range']),
  K(/dough rounder/i, 'A dough rounder shapes divided dough pieces into smooth balls ready for proofing or moulding.', ['Bread and bun bakeries'], ['Portion weight range', 'Output per hour']),
  K(/dough moulder/i, 'A dough moulder shapes rested dough into loaf forms quickly and consistently.', ['Bread bakeries'], ['Loaf sizes you make', 'Output per hour']),
  K(/slicer/i, 'A bread slicer cuts loaves into even slices at the thickness you set, ready for bagging.', ['Bakeries', 'Supermarket bakery counters'], ['Table-top or standing type', 'Slice thickness', 'Loaves per hour']),
  K(/pizza (roller|dough press|machine|work table)|marble pizza/i, 'This pizza-line equipment helps shape or prepare pizza bases and toppings quickly and consistently.', ['Pizzerias', 'Fast food outlets', 'Restaurants'], ['Pizza size', 'Manual or powered type', 'Counter space']),
  K(/cake decoration/i, 'A cake decoration machine helps finish cakes quickly and evenly.', ['Cake shops', 'Bakeries'], ['Cake sizes', 'Power supply']),
  K(/(bread|cake).*(rack|basket)|bakers? rack|cooling rack|bread cooking rack/i, 'A rack used to hold, cool or move bread and baking trays without crowding.', ['Bakeries', 'Supermarket bakeries'], ['Rack height and number of trays', 'Wheeled or fixed']),
  K(/sealing tape/i, 'Sealing tape used to close bread bags neatly.', ['Bakeries', 'Packaging bread and snacks'], ['Quantity and colour']),
  K(/gondola/i, 'A gondola shelf is the standard free-standing supermarket shelf, with adjustable levels so you can arrange products of different sizes.', ['Supermarkets and mini-marts', 'Pharmacies and general stores'], ['Single or double sided', 'Length of each run', 'Number of shelf levels']),
  K(/check ?out/i, 'A checkout counter gives your cashier a stable place to scan, pack and take payment.', ['Supermarkets', 'Retail stores'], ['Counter length', 'Equipment to fit on top']),
  K(/trolley.*basket|shopping basket|multipurpose basket|basket/i, 'Baskets and trolleys that let customers carry their shopping.', ['Supermarkets', 'Retail stores'], ['Number of baskets or trolleys', 'Colour options if shown']),
  K(/trolley/i, 'A trolley for moving goods, plates or trays quickly around a kitchen or store.', ['Kitchens and bakeries', 'Supermarkets'], ['Number of layers', 'Load you will carry']),
  K(/supermarket setup|shelves on display|heavy duty shelf|supermarket shelves/i, 'Shelving and display units arranged for a supermarket or store.', ['Supermarkets', 'Mini-marts and retail stores'], ['Floor plan and runs', 'Product mix']),
  K(/island.*freezer|islander/i, 'An island freezer sits in the sales floor with an open top so customers can reach frozen goods from every side.', ['Supermarkets', 'Frozen food and ice cream sellers'], ['Length', 'Power supply']),
  K(/open (display )?curtain|curtain display|curtain chiller/i, 'An open curtain chiller keeps products cold while leaving the front open for easy self-service.', ['Supermarkets', 'Drinks and dairy sellers'], ['Width and height', 'Number of shelves', 'Power supply']),
  K(/cake chiller/i, 'A cake chiller is a glass-fronted refrigerated display that keeps cakes and desserts cold while customers can see them.', ['Bakeries and cake shops', 'Hotels and restaurants'], ['Curved or straight glass', 'Length in feet', 'Power supply']),
  K(/ice cream (fryer|machine|display|popsicle)|batch\/hard ice cream|popsicle/i, 'Equipment for making, freezing or displaying ice cream and frozen treats.', ['Ice cream parlours', 'Restaurants and fast food outlets'], ['Standing or table-top type', 'Output you need', 'Power supply']),
  K(/ice (cube|flake)/i, 'An ice machine that makes ice on site for drinks, display and food preservation.', ['Bars and restaurants', 'Fish and meat sellers', 'Hotels'], ['Cube or flake ice', 'Daily ice quantity', 'Water and power supply']),
  K(/blast chiller/i, 'A blast chiller cools cooked food quickly so it can be stored safely.', ['Restaurants and hotels', 'Catering kitchens'], ['Quantity cooled per batch', 'Power supply']),
  K(/water chiller/i, 'A water chiller cools water for drinking or production use.', ['Water producers', 'Offices and schools', 'Bakeries'], ['Capacity or horse power', 'Power supply']),
  K(/wine chiller/i, 'A wine chiller keeps bottles at serving temperature behind a glass door.', ['Bars and lounges', 'Restaurants and hotels'], ['Number of doors', 'Finish', 'Power supply']),
  K(/meat chiller/i, 'A meat chiller keeps meat cold and on display or in storage.', ['Butchers and supermarkets', 'Restaurants'], ['Length in feet', 'Power supply']),
  K(/salad bar/i, 'A salad bar chiller keeps salad, toppings and sauces cold and within reach.', ['Restaurants and fast food outlets', 'Supermarkets'], ['Number of doors or pans', 'Power supply']),
  K(/fridge|freezer|chiller|display fridge/i, 'A commercial chiller or fridge/freezer that keeps food and drinks at a safe, cold temperature, many with glass doors for display.', ['Restaurants and bars', 'Supermarkets and shops', 'Hotels and caterers'], ['Number of doors', 'Chiller or freezer use', 'Power supply']),
  K(/juice dispenser/i, 'A juice dispenser chills and serves drinks from one or more chambers.', ['Restaurants and cafes', 'Events and hotels'], ['Number of chambers', 'Power supply']),
  K(/citrus|juicer|juice extractor|sugar ?cane|tiger nut/i, 'An extractor that presses juice or milk from fruit, sugar cane or nuts faster than hand pressing.', ['Juice bars', 'Small food and drink producers', 'Restaurants'], ['Manual or automatic type', 'Quantity per hour', 'Power supply']),
  K(/chin chin|noodles? cutter/i, 'A cutting machine that portions rolled dough into uniform pieces for chin chin and similar snacks.', ['Snack producers', 'Bakeries'], ['Manual or automatic type', 'Cut size', 'Output per hour']),
  K(/peanut|groundnut/i, 'A machine for roasting or coating groundnuts in volume.', ['Snack makers', 'Food processors'], ['Quantity per batch', 'Gas or electric supply']),
  K(/dehydrator/i, 'A dehydrator removes moisture from food at controlled temperature for drying fruit, vegetables and other products.', ['Food processors', 'Farm produce handlers'], ['Number of trays', 'Power supply']),
  K(/grinder|mincer|meat cutter|bone saw/i, 'A grinding, mincing or cutting machine for processing meat, spices or dry ingredients in volume.', ['Butchers and meat processors', 'Food processors', 'Restaurants'], ['What you will process', 'Wet or dry use', 'Power supply']),
  K(/feather plucker/i, 'A feather plucker removes feathers from poultry quickly after scalding.', ['Poultry processors', 'Butchers'], ['Birds per batch', 'Power supply']),
  K(/blender|food processor/i, 'A commercial blender or food processor for chopping, blending and grinding in volume.', ['Restaurants and juice bars', 'Food processors', 'Caterers'], ['Capacity', 'Power supply']),
  K(/vegetable cutter|potato peeler/i, 'A machine that peels or cuts vegetables into uniform pieces, saving manual preparation time.', ['Restaurants and caterers', 'Food processors'], ['Manual or powered type', 'Quantity per hour']),
  K(/vibrating sieve|sieve/i, 'A vibrating sieve separates powders and particles by size.', ['Food processors', 'Flour and spice producers'], ['Mesh size', 'Power supply']),
  K(/shawarma/i, 'A shawarma machine roasts meat on a vertical spit so it can be shaved fresh for orders. It is available as gas or electric, imported or locally fabricated.', ['Shawarma outlets', 'Fast food restaurants'], ['Gas or electric', 'Number of burners', 'Meat quantity per spit']),
  K(/kebab/i, 'A kebab machine roasts meat on a vertical spit for fresh slicing.', ['Fast food restaurants', 'Shawarma outlets'], ['Gas or electric', 'Number of burners']),
  K(/rotisserie|chicken roaster/i, 'A chicken rotisserie turns birds on rods in a heated chamber for even roasting.', ['Chicken restaurants', 'Fast food outlets', 'Events and catering'], ['Gas or electric', 'Number of chickens per batch', 'Table-top or standing']),
  K(/pressure (fryer|pot)/i, 'A pressure fryer or pot cooks under pressure, which speeds up cooking and keeps food moist.', ['Fried chicken outlets', 'Restaurants and caterers'], ['Capacity', 'Gas or electric']),
  K(/fryer/i, 'A commercial deep fryer heats a large volume of oil to fry food quickly and consistently, with options for single or double baskets, gas or electric, table-top or standing.', ['Fast food outlets', 'Restaurants and hotels', 'Snack producers'], ['Gas or electric', 'Single or double basket', 'Table-top or standing']),
  K(/griddle|lava rock grill|hot dog grill|grill|barbecue/i, 'A flat griddle or grill for cooking burgers, eggs, sausages, meat and vegetables on a hot surface.', ['Fast food outlets', 'Restaurants and cafes', 'Street food businesses'], ['Gas or electric', 'Cooking surface size', 'Table-top or standing']),
  K(/waffle|crepe|pancake/i, 'A waffle, crepe or pancake maker for quick, consistent batches at the counter.', ['Cafes and dessert shops', 'Fast food outlets'], ['Plate size', 'Power supply']),
  K(/pop ?corn|cotton candy|candy floss/i, 'A popcorn or candy floss machine for snack counters and events.', ['Event vendors', 'Cinemas and snack shops'], ['Gas or electric', 'Batch size']),
  K(/warmer|holding cabinet/i, 'A food or snack warmer keeps cooked food hot and presentable at the counter.', ['Fast food outlets', 'Restaurants and canteens', 'Bakeries with hot snacks'], ['Number of plates or width in feet', 'Curved or straight glass', 'Power supply']),
  K(/toaster/i, 'A toaster for bread or shawarma wraps, built for repeated commercial use.', ['Fast food outlets', 'Cafes and hotels'], ['Slices or capacity', 'Power supply']),
  K(/cook(ing)? range|gas cooker|electric cooker|stock pot|chinese gas|boiling pan/i, 'A commercial cooker with multiple burners (and, on some models, an oven or griddle) for professional cooking.', ['Restaurants and hotels', 'Caterers and canteens', 'Schools'], ['Number of burners', 'Gas or electric', 'With or without oven']),
  K(/kitchen hood|extractor/i, 'A hood or extractor draws heat, steam and fumes from the cooking area and out of the building.', ['Commercial kitchens', 'Restaurants and hotels'], ['Length above the cooking line', 'Duct route', 'Power supply']),
  K(/sink/i, 'A stainless steel sink for washing and preparation, in single, double or three-bowl layouts, some with a drainer side.', ['Commercial kitchens', 'Bakeries', 'Hotels'], ['Number of bowls', 'With or without drainer side', 'Overall length']),
  K(/work ?table/i, 'A stainless steel worktable for preparation, with options such as splash back and under-shelf.', ['Commercial kitchens', 'Bakeries', 'Food processing areas'], ['Length in feet', 'Splash back and shelves', 'Height']),
  K(/shelf|shelves|rack/i, 'Shelving or racking for organised storage in a kitchen, store or bakery.', ['Kitchens and bakeries', 'Stores'], ['Length in feet', 'Number of levels']),
  K(/washing|laundry|dryer/i, 'A commercial laundry machine built for the heavy, repeated loads of hotels, hospitals and laundry businesses.', ['Hotels and guest houses', 'Laundry and dry-cleaning businesses', 'Hospitals and schools'], ['Load size in kg', 'Water, drain and power connections']),
  K(/ironing/i, 'A commercial ironing machine that finishes linen and clothes faster than hand pressing.', ['Hotels and laundries'], ['Type needed', 'Volume of linen per day']),
  K(/reverse osmosis|treatment/i, 'Water treatment equipment that purifies water before filling, including reverse osmosis and treatment tanks.', ['Sachet and bottled water producers'], ['Source water quality', 'Output per hour']),
  K(/sachet water|water factory|bottle and sachet/i, 'A production setup for sachet or bottled water, covering treatment, filling and sealing.', ['Sachet and bottled water producers'], ['Target output per hour', 'Sachet, bottle or both', 'Power and water supply']),
  K(/pet (blower|blowing|bottle)|mono block/i, 'Equipment for making and filling PET bottles, from blowing preforms into bottles to filling and capping them.', ['Bottled water and drinks producers'], ['Bottle sizes', 'Output per hour', 'Power and compressed air']),
  K(/compressor/i, 'An air compressor supplies the compressed air that blowing and packing machines use.', ['Bottle producers', 'Packaging lines'], ['Required pressure and flow', 'Power supply']),
  K(/shrink/i, 'A shrink wrapper bundles products in heat-shrunk film for transport and display.', ['Water and drinks producers', 'Packaging lines'], ['Pack size', 'Output per hour']),
  K(/coding|ink ?jet/i, 'A date coding or ink jet printer marks batch and expiry information on packs.', ['Food and drink producers'], ['Print content', 'Line speed']),
  K(/filling|liquid filler/i, 'A filling machine dispenses a set volume into bottles or sachets.', ['Water, juice and liquid producers'], ['Container size', 'Output per hour']),
  K(/seal|packag|wrapper|vacuum/i, 'A sealing or packaging machine that closes bags, cups or wrapped products neatly and securely.', ['Food businesses', 'Bakeries and snack makers', 'Retail packers'], ['Type of pack you use', 'Pack size', 'Output per hour']),
  K(/scale/i, 'A weighing scale for portioning ingredients or weighing goods, in digital or platform types.', ['Bakeries and kitchens', 'Stores and warehouses'], ['Maximum weight', 'Accuracy needed']),
  K(/speaker|sound|amplifier/i, 'A professional sound system for events, venues and worship spaces.', ['Event companies', 'Clubs and lounges', 'Churches and halls'], ['Venue size and guest count', 'Indoor or outdoor use']),
  K(/stage|truss|canopy|sleeve block|base|top section/i, 'Stage and trussing equipment for supporting lights, speakers and canopies at events.', ['Event companies', 'Venues and festivals'], ['Stage size', 'Load to be carried']),
  K(/light|parcan|cob|fresnel|baton|sparkler|laser|led mask|smoke/i, 'Stage lighting and effects for events, clubs and lounges.', ['Event companies', 'Clubs and lounges'], ['Number of fixtures', 'Indoor or outdoor']),
  K(/carrier|glorifier|bucket|champagne|belaire|message board|alert/i, 'Presentation and display accessories for bars, lounges and events.', ['Clubs and lounges', 'Event companies'], ['Quantity', 'Style']),
]

const FALLBACK = (cat: SeedCategory): Kind => ({ re: /./, what: cat.blurb, uses: [cat.audience], ask: ['Quantity and model', 'Power or gas supply', 'Delivery location'] })

const pick = (name: string, cat: SeedCategory): Kind => KINDS.find((k) => k.re.test(name)) ?? FALLBACK(cat)

const sentence = (s: string) => s.replace(/\s+/g, ' ').trim()
const list = (xs: string[]) => xs.map((x) => `- ${x}`).join('\n')
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

function clip(s: string, max: number): string {
  const t = sentence(s)
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:.\-–]$/, '') + '…'
}

const SIZE_OPT = /tray|kg|\bl\b|litre|burner|door|horse|feet|plate|chamber|chicken|slice|cut/i

export interface ProductRecord {
  name: string
  summary: string
  description: string
  applications: string[]
  capacity: string
  specs: { label: string; value: string }[]
  faqs: Faq[]
  seoTitle: string
  seoDescription: string
  imageAlts: string[]
}

export function buildProduct(item: Extracted, name: string, cat: SeedCategory, duplicate: boolean): ProductRecord {
  const kind = pick(name, cat)
  const opts = item.options.filter(Boolean)
  const variants = item.variants.filter((v) => v && v !== item.name)

  const optionLine = opts.length
    ? `The catalogue shows this item with the following options or sizes: ${opts.join(', ')}. Tell us which you need and we will confirm availability.`
    : 'Tell us the size and type you need and we will confirm the models available.'
  const variantLine = variants.length ? `\n\nRelated variants shown in our catalogue: ${variants.slice(0, 6).join('; ')}.` : ''

  const summary = clip(`${name} for ${lower(cat.audience)} in Nigeria. ${kind.what}`, 290)

  const description = [
    `**${name}** is part of MASFIG's ${cat.name.toLowerCase()} range, supplied from Lagos. ${kind.what}`,
    `### Typical uses\n${list(kind.uses)}`,
    `### Options and specifications\n${optionLine} Exact capacity, power or fuel requirement, dimensions and finish are confirmed on your quotation for the model we supply.${variantLine}`,
    `### Before you order\nTo give you an accurate quote, we usually ask about:\n${list(kind.ask)}`,
    `### Delivery and support\nMASFIG LTD is based in Ojo, Lagos, and arranges delivery across Nigeria. Request a quote on this page, call us or message us on WhatsApp.`,
  ].join('\n\n')

  const capacity = opts.filter((o) => SIZE_OPT.test(o)).join(', ').slice(0, 190)

  const specs: { label: string; value: string }[] = [{ label: 'Product range', value: cat.name }]
  if (opts.length) specs.push({ label: 'Options in catalogue', value: opts.join(', ').slice(0, 280) })
  specs.push({ label: 'Full specification', value: 'Confirmed on quotation' })

  const faqs: Faq[] = [
    { question: `How much does a ${name} cost?`, answer: `Prices depend on the exact model, size and options. Use the quote form on this page, call us or message us on WhatsApp and we will reply with a price and availability.` },
    { question: `Can MASFIG deliver and install this ${name.toLowerCase()}?`, answer: 'We supply from Lagos and can arrange delivery and installation. Tell us your location and site details when you request a quote.' },
  ]
  if (opts.length) faqs.push({ question: `What sizes or options are available for the ${name}?`, answer: `The catalogue lists these options: ${opts.join(', ')}. Ask us to confirm which are currently available.` })

  const forWhom = duplicate ? ` for ${cat.audience}` : ' for Sale in Nigeria'
  let seoTitle = `${name}${forWhom} | MASFIG`
  if (seoTitle.length > 70) seoTitle = `${name} | MASFIG`
  if (seoTitle.length > 70) seoTitle = clip(`${name}`, 60) + ' | MASFIG'

  const seoDescription = clip(`Buy ${name} in Lagos, Nigeria. ${kind.what.split('. ')[0]}. Request a quote from MASFIG LTD, Ojo Alaba.`, 168)

  const imageAlts = item.images.map((_, i) => {
    const v = variants[i] ?? (i === 0 ? name : `${name}, view ${i + 1}`)
    return clip(`${v} supplied by MASFIG LTD`, 195)
  })

  return { name, summary, description, applications: kind.uses, capacity, specs, faqs, seoTitle, seoDescription, imageAlts }
}
