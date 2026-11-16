/** Categories and products for the seed script. Specs come from the existing masfig.com site; no prices are set (quote only). */

export interface SeedProduct {
  slug: string; name: string; category: string; photo: string; imageAlt: string
  summary: string; description: string
  specs: { label: string; value: string }[]
  capacity: string; power: string; applications: string[]
  seoTitle: string; seoDescription: string
  faqs: { question: string; answer: string }[]
}

const commonFaqs = (what: string) => [
  { question: `How do I get a price for ${what}?`, answer: 'Send a quote request on this page, call us or message us on WhatsApp. Tell us your business type, volumes and kitchen or bakery layout so we can recommend the right model and give you a firm price.' },
  { question: 'Do you deliver and install in Nigeria?', answer: 'Yes. MASFIG supplies equipment from Lagos and can arrange delivery and installation. Tell us your location when you request a quote.' },
]

export const PRODUCTS: SeedProduct[] = [
  {
    slug: 'industrial-deck-oven', name: 'Industrial Deck Oven', category: 'bakery-equipment', photo: 'deck-oven.jpg',
    imageAlt: 'Industrial deck oven with four baking decks',
    summary: 'Premium European-standard deck oven for artisanal bread and pastries.',
    description: 'A four-deck oven built for bakeries that want even, repeatable baking. Precise temperature control and even heat distribution help you bake bread and pastries to the same standard batch after batch.\n\nA deck oven suits bakeries that produce a range of products at once, because each deck can be managed separately. Contact MASFIG to confirm the right size, power supply and installation for your premises.',
    specs: [{ label: 'Decks', value: '4' }, { label: 'Temperature range', value: '50-300°C' }, { label: 'Output', value: '200+ loaves per batch' }, { label: 'Power', value: '18-22 kW' }],
    capacity: '200+ loaves per batch', power: '18-22 kW', applications: ['Bread bakeries', 'Pastry production', 'Hotel bakeries'],
    seoTitle: 'Industrial Deck Oven for Bakeries | Nigeria | MASFIG',
    seoDescription: 'Four-deck industrial oven with precise temperature control for bread and pastry. Request a quote from MASFIG LTD, Lagos.',
    faqs: commonFaqs('an industrial deck oven'),
  },
  {
    slug: 'spiral-dough-mixer', name: 'Spiral Dough Mixer', category: 'bakery-equipment', photo: 'dough-mixer.jpg',
    imageAlt: 'Heavy-duty spiral dough mixer',
    summary: 'Heavy-duty mixer for bakeries and catering operations.',
    description: 'A spiral mixer made for bakeries that mix dough every day. The 80-litre bowl handles large batches and delivers smooth, consistent dough, with three speeds to suit different recipes.\n\nIt is designed to clean quickly between batches, which matters when you run several doughs in a day. Talk to MASFIG about the right mixer size for your daily production.',
    specs: [{ label: 'Bowl capacity', value: '80 L' }, { label: 'Speeds', value: '3' }, { label: 'Batch size', value: 'Up to 60 kg' }, { label: 'Power', value: '2.2 kW' }],
    capacity: 'Up to 60 kg per batch', power: '2.2 kW', applications: ['Bakeries', 'Catering kitchens', 'Pastry production'],
    seoTitle: 'Spiral Dough Mixer 80L for Bakeries | MASFIG Nigeria',
    seoDescription: 'Heavy-duty 80 litre spiral dough mixer with three speeds for bakeries and caterers. Request a quote from MASFIG LTD, Lagos.',
    faqs: commonFaqs('a spiral dough mixer'),
  },
  {
    slug: 'deep-fryer-pro', name: 'Deep Fryer Pro', category: 'fast-food-restaurant-equipment', photo: 'commercial-fryer.jpg',
    imageAlt: 'Dual basin commercial deep fryer',
    summary: 'High-capacity commercial fryer for kitchens and food courts.',
    description: 'A dual-basin fryer for kitchens that fry in volume. Rapid heat recovery keeps oil at temperature between batches, and the stainless steel basket stands up to daily use.\n\nWith a temperature range of 60-200°C you can fry a varied menu, from snacks to mains. MASFIG can help you confirm power requirements and placement before delivery.',
    specs: [{ label: 'Basins', value: 'Dual' }, { label: 'Temperature range', value: '60-200°C' }, { label: 'Output', value: '100+ servings per hour' }, { label: 'Power', value: '15 kW' }],
    capacity: '100+ servings per hour', power: '15 kW', applications: ['Restaurants', 'Food courts', 'Hotel kitchens'],
    seoTitle: 'Commercial Deep Fryer Dual Basin | MASFIG Nigeria',
    seoDescription: 'Dual-basin commercial deep fryer with rapid heat recovery for restaurants and food courts. Request a quote from MASFIG LTD.',
    faqs: commonFaqs('a commercial deep fryer'),
  },
  {
    slug: 'display-refrigerator', name: 'Display Refrigerator', category: 'refrigeration-equipment', photo: 'display-fridge.jpg',
    imageAlt: 'Curved glass display refrigerator for pastries and desserts',
    summary: 'Elegant display fridge for pastries and desserts.',
    description: 'A curved-glass display refrigerator that shows pastries and desserts from every angle, so guests can see what you offer. The 450-litre cabinet suits hotels, cafés and bakeries that sell chilled products.\n\nIt is designed to be energy efficient, and its temperature range covers both chilled and frozen display needs. Ask MASFIG which configuration suits your space.',
    specs: [{ label: 'Capacity', value: '450 L' }, { label: 'Glass', value: 'Curved' }, { label: 'Temperature range', value: '-18 to 8°C' }, { label: 'Power', value: '0.75 kW' }],
    capacity: '450 L', power: '0.75 kW', applications: ['Hotels', 'Cafés', 'Bakeries and pastry shops'],
    seoTitle: 'Display Refrigerator 450L for Pastry | MASFIG Nigeria',
    seoDescription: 'Curved-glass 450 litre display refrigerator for pastries and desserts. Request a quote from MASFIG LTD, Lagos.',
    faqs: commonFaqs('a display refrigerator'),
  },
  {
    slug: 'industrial-meat-slicer', name: 'Industrial Meat Slicer', category: 'food-processing', photo: 'meat-slicer.jpg',
    imageAlt: 'Industrial meat and deli slicer with a 300 mm blade',
    summary: 'Precision meat and deli slicer for food service.',
    description: 'A slicer for processors and food service operations that need consistent portions. The 300 mm blade and adjustable thickness help you slice meat and deli products evenly, which makes portion control and pricing simpler.\n\nParts are dishwasher safe, so cleaning is straightforward. Contact MASFIG to discuss slicing volumes and the right model for your operation.',
    specs: [{ label: 'Blade', value: '300 mm' }, { label: 'Slice thickness', value: '1-30 mm' }, { label: 'Output', value: 'Up to 150 kg per hour' }, { label: 'Power', value: '0.5 kW' }],
    capacity: 'Up to 150 kg per hour', power: '0.5 kW', applications: ['Meat processing', 'Delis', 'Hotel kitchens'],
    seoTitle: 'Industrial Meat Slicer 300mm Blade | MASFIG Nigeria',
    seoDescription: 'Industrial 300 mm meat and deli slicer with adjustable thickness for consistent portions. Request a quote from MASFIG LTD.',
    faqs: commonFaqs('an industrial meat slicer'),
  },
  {
    slug: 'automatic-packaging-sealer', name: 'Automatic Packaging Sealer', category: 'water-production-packaging', photo: 'packaging-sealer.jpg',
    imageAlt: 'Automatic food-grade packaging sealer',
    summary: 'Food-grade sealer for commercial packaging operations.',
    description: 'An automatic sealer for food producers and bakeries that pack every day. Adjustable temperature lets you seal different bag materials, and safe operation protects your staff on a busy line.\n\nSeal width and speed are listed below to help you compare it with your volumes. Contact MASFIG to confirm it suits the packaging you use.',
    specs: [{ label: 'Seal width', value: '4-8 mm' }, { label: 'Sealing speed', value: '400 mm/s' }, { label: 'Output', value: '50+ bags per minute' }, { label: 'Power', value: '1.2 kW' }],
    capacity: '50+ bags per minute', power: '1.2 kW', applications: ['Bakeries', 'Food producers', 'Supermarkets'],
    seoTitle: 'Automatic Packaging Sealer for Food | MASFIG Nigeria',
    seoDescription: 'Automatic food-grade packaging sealer with adjustable temperature for commercial packing. Request a quote from MASFIG LTD.',
    faqs: commonFaqs('an automatic packaging sealer'),
  },
]
