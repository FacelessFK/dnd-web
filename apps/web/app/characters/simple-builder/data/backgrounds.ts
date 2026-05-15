import type { Background } from '../types';

const backgroundImage = (id: string) =>
  `/assets/character-builder/backgrounds/${id}.png`;
const backgroundSymbol = (id: string) =>
  `/assets/character-builder/backgrounds/symbols/${id}.png`;

export const BACKGROUNDS: Background[] = [
  {
    id: 'acolyte',
    name: 'Acolyte',
    tagline: 'Devoted servant of a temple and its gods',
    imageUrl: backgroundImage('acolyte'),
    symbolUrl: backgroundSymbol('acolyte'),
    skillProficiencies: ['Insight', 'Religion'],
    toolProficiencies: [],
    languages: 2,
    feature: {
      name: 'Shelter of the Faithful',
      description:
        'As an acolyte, you command the respect of those who share your faith. You and your adventuring companions can expect to receive free healing and care at a temple, shrine, or other established presence of your faith.',
    },
    equipment: [
      'Holy symbol',
      'Prayer book',
      '5 sticks of incense',
      'Vestments',
      'Common clothes',
      '15 gp',
    ],
    personalityTraits: [
      "I idolize a particular hero of my faith and constantly reference that person's deeds.",
      'I can find common ground between the fiercest enemies.',
    ],
    ideals: ['Tradition', 'Charity', 'Change'],
    bonds: ['I owe my life to the priest who took me in when my parents died.'],
    flaws: ['I judge others harshly and myself even more severely.'],
  },
  {
    id: 'charlatan',
    name: 'Charlatan',
    tagline: 'Silver-tongued deceiver with a talent for the con',
    imageUrl: backgroundImage('charlatan'),
    symbolUrl: backgroundSymbol('charlatan'),
    skillProficiencies: ['Deception', 'Sleight of Hand'],
    toolProficiencies: ['Disguise kit', 'Forgery kit'],
    languages: 0,
    feature: {
      name: 'False Identity',
      description:
        'You have created a second identity that includes documentation, established acquaintances, and disguises that allow you to assume that persona. You can also forge documents including official papers and personal letters.',
    },
    equipment: ['Fine clothes', 'Disguise kit', 'Con tools', '15 gp'],
    personalityTraits: [
      'I fall in and out of love easily and am always pursuing someone.',
      'I have a joke for every occasion, especially occasions where humor is inappropriate.',
    ],
    ideals: ['Independence', 'Fairness', 'Creativity'],
    bonds: [
      'I fleeced the wrong person and must work to ensure they never find me.',
    ],
    flaws: ["I can't resist a pretty face."],
  },
  {
    id: 'criminal',
    name: 'Criminal',
    tagline: 'Seasoned outlaw with a network of shady contacts',
    imageUrl: backgroundImage('criminal'),
    symbolUrl: backgroundSymbol('criminal'),
    skillProficiencies: ['Deception', 'Stealth'],
    toolProficiencies: ["Thieves' tools", 'One type of gaming set'],
    languages: 0,
    feature: {
      name: 'Criminal Contact',
      description:
        'You have a reliable and trustworthy contact who acts as your liaison to a network of criminals. You know how to get messages to and from your contact, even over great distances.',
    },
    equipment: ['Crowbar', 'Dark common clothes with hood', '15 gp'],
    personalityTraits: [
      'I always have a plan for what to do when things go wrong.',
      'I am always calm, no matter what the situation.',
    ],
    ideals: ['Freedom', 'Greed', 'Honor among thieves'],
    bonds: [
      "I'm trying to pay off an old debt I owe to a generous benefactor.",
    ],
    flaws: [
      "When I see something valuable, I can't think of anything but how to steal it.",
    ],
  },
  {
    id: 'entertainer',
    name: 'Entertainer',
    tagline: 'Crowd-pleasing performer who lives for the spotlight',
    imageUrl: backgroundImage('entertainer'),
    symbolUrl: backgroundSymbol('entertainer'),
    skillProficiencies: ['Acrobatics', 'Performance'],
    toolProficiencies: ['Disguise kit', 'One type of musical instrument'],
    languages: 0,
    feature: {
      name: 'By Popular Demand',
      description:
        "You can always find a place to perform, usually in an inn or tavern but possibly with a circus, at a theatre, or even in a noble's court. Your performance makes you the equivalent of a local celebrity.",
    },
    equipment: ['Musical instrument', "Entertainer's costume", '15 gp'],
    personalityTraits: [
      'I know a story relevant to almost every situation.',
      'Whenever I come to a new place, I collect local rumors and spread gossip.',
    ],
    ideals: ['Beauty', 'Creativity', 'Freedom'],
    bonds: [
      'My instrument is my most treasured possession and it reminds me of someone I love.',
    ],
    flaws: ["I'm a sucker for a pretty face."],
  },
  {
    id: 'folk-hero',
    name: 'Folk Hero',
    tagline: 'Champion of the common people, risen from humble origins',
    imageUrl: backgroundImage('folk-hero'),
    symbolUrl: backgroundSymbol('folk-hero'),
    skillProficiencies: ['Animal Handling', 'Survival'],
    toolProficiencies: ["One type of artisan's tools", 'Vehicles (land)'],
    languages: 0,
    feature: {
      name: 'Rustic Hospitality',
      description:
        'Since you come from the ranks of the common folk, you fit in among them with ease. You can find a place to hide, rest, or recuperate among commoners, unless you have shown yourself to be a danger to them.',
    },
    equipment: [
      "Artisan's tools",
      'Shovel',
      'Iron pot',
      'Common clothes',
      '10 gp',
    ],
    personalityTraits: [
      'I judge people by their actions, not their words.',
      "If someone is in trouble, I'm always ready to lend help.",
    ],
    ideals: ['Respect', 'Fairness', 'People'],
    bonds: ['I have a family, but I have no idea where they are.'],
    flaws: ['I have trouble trusting in my allies.'],
  },
  {
    id: 'guild-artisan',
    name: 'Guild Artisan',
    tagline: 'Skilled craftsperson backed by a powerful merchant guild',
    imageUrl: backgroundImage('guild-artisan'),
    symbolUrl: backgroundSymbol('guild-artisan'),
    skillProficiencies: ['Insight', 'Persuasion'],
    toolProficiencies: ["One type of artisan's tools"],
    languages: 1,
    feature: {
      name: 'Guild Membership',
      description:
        'As an established member of a guild, you can rely on certain benefits that membership provides. Fellow guild members will provide you with lodging and food if necessary, and pay for your funeral if needed.',
    },
    equipment: [
      "Artisan's tools",
      'Letter of introduction from guild',
      "Traveler's clothes",
      '15 gp',
    ],
    personalityTraits: [
      'I believe that anything worth doing is worth doing right.',
      "I'm rude to people who lack my commitment to hard work.",
    ],
    ideals: ['Community', 'Generosity', 'Aspiration'],
    bonds: [
      'The workshop where I learned my trade is the most important place in the world to me.',
    ],
    flaws: ["I'll do anything to get my hands on something rare or priceless."],
  },
  {
    id: 'hermit',
    name: 'Hermit',
    tagline: 'Secluded seeker who discovered a profound truth',
    imageUrl: backgroundImage('hermit'),
    symbolUrl: backgroundSymbol('hermit'),
    skillProficiencies: ['Medicine', 'Religion'],
    toolProficiencies: ['Herbalism kit'],
    languages: 1,
    feature: {
      name: 'Discovery',
      description:
        'The quiet seclusion of your extended hermitage gave you access to a unique and powerful discovery. The exact nature of this revelation is up to you and the DM. It might be a great truth about the cosmos or the gods, or it could be a site that no one else has ever seen.',
    },
    equipment: [
      'Scroll case with notes',
      'Winter blanket',
      'Common clothes',
      'Herbalism kit',
      '5 gp',
    ],
    personalityTraits: [
      "I've been isolated for so long that I rarely speak, preferring gestures and expressions.",
      'I am utterly serene, even in the face of disaster.',
    ],
    ideals: ['Greater Good', 'Logic', 'Reflection'],
    bonds: [
      'I entered seclusion to hide from the ones who might still be hunting me.',
    ],
    flaws: [
      "Now that I've returned to the world, I enjoy its delights perhaps too much.",
    ],
  },
  {
    id: 'noble',
    name: 'Noble',
    tagline: 'Born to wealth and privilege with high-society connections',
    imageUrl: backgroundImage('noble'),
    symbolUrl: backgroundSymbol('noble'),
    skillProficiencies: ['History', 'Persuasion'],
    toolProficiencies: ['One type of gaming set'],
    languages: 1,
    feature: {
      name: 'Position of Privilege',
      description:
        'Thanks to your noble birth, people are inclined to think the best of you. You are welcome in high society, and people assume you have the right to be wherever you are. Common folk make every effort to accommodate you, and other people of high birth treat you as a member of the same social sphere.',
    },
    equipment: ['Fine clothes', 'Signet ring', 'Scroll of pedigree', '25 gp'],
    personalityTraits: [
      'My eloquent flattery makes everyone I talk to feel like the most wonderful and important person in the world.',
      'The common folk love me for my kindness and generosity.',
    ],
    ideals: ['Responsibility', 'Noble Obligation', 'Power'],
    bonds: ['I will face any challenge to win the approval of my family.'],
    flaws: ['I secretly believe that everyone is beneath me.'],
  },
  {
    id: 'outlander',
    name: 'Outlander',
    tagline: 'Wanderer from the wild places beyond civilization',
    imageUrl: backgroundImage('outlander'),
    symbolUrl: backgroundSymbol('outlander'),
    skillProficiencies: ['Athletics', 'Survival'],
    toolProficiencies: ['One type of musical instrument'],
    languages: 1,
    feature: {
      name: 'Wanderer',
      description:
        'You have an excellent memory for maps and geography, and you can always recall the general layout of terrain, settlements, and other features around you. In addition, you can find food and fresh water for yourself and up to five other people each day.',
    },
    equipment: [
      'Staff',
      'Hunting trap',
      'Trophy from an animal you killed',
      "Traveler's clothes",
      '10 gp',
    ],
    personalityTraits: [
      "I'm driven by a wanderlust that led me away from home.",
      'I watch over my friends as if they were a litter of newborn pups.',
    ],
    ideals: ['Change', 'Nature', 'Glory'],
    bonds: [
      'My family, clan, or tribe is the most important thing in my life.',
    ],
    flaws: [
      "I remember every insult I've received and nurse a silent resentment toward anyone who's ever wronged me.",
    ],
  },
  {
    id: 'sage',
    name: 'Sage',
    tagline: 'Scholar with vast knowledge and an insatiable curiosity',
    imageUrl: backgroundImage('sage'),
    symbolUrl: backgroundSymbol('sage'),
    skillProficiencies: ['Arcana', 'History'],
    toolProficiencies: [],
    languages: 2,
    feature: {
      name: 'Researcher',
      description:
        'When you attempt to learn or recall a piece of lore, if you do not know that information, you often know where and from whom you can obtain it. Usually this information comes from a library, scriptorium, university, or a sage or other learned person or creature.',
    },
    equipment: [
      'Bottle of black ink',
      'Quill',
      'Small knife',
      'Letter from a dead colleague',
      'Common clothes',
      '10 gp',
    ],
    personalityTraits: [
      'I use polysyllabic words that convey the impression of great erudition.',
      "I've read every book in the world's greatest libraries — or I like to boast that I have.",
    ],
    ideals: ['Knowledge', 'Logic', 'Power of Knowledge'],
    bonds: [
      'I have an ancient text that holds terrible secrets that must not fall into the wrong hands.',
    ],
    flaws: ['I am easily distracted by the promise of information.'],
  },
  {
    id: 'sailor',
    name: 'Sailor',
    tagline: 'Sea-hardened mariner who has faced storms and monsters',
    imageUrl: backgroundImage('sailor'),
    symbolUrl: backgroundSymbol('sailor'),
    skillProficiencies: ['Athletics', 'Perception'],
    toolProficiencies: ["Navigator's tools", 'Vehicles (water)'],
    languages: 0,
    feature: {
      name: "Ship's Passage",
      description:
        "When you need to, you can secure free passage on a sailing ship for yourself and your adventuring companions. You might sail on the ship you served on, or another ship you have good relations with. Because you're calling in a favor, you can't be certain of a schedule or route that will meet your every need.",
    },
    equipment: [
      'Belaying pin (club)',
      '50 feet of silken rope',
      'Lucky charm',
      'Common clothes',
      '10 gp',
    ],
    personalityTraits: [
      'My friends know they can rely on me, no matter what.',
      'I work hard so that I can play hard when the work is done.',
    ],
    ideals: ['Respect', 'Freedom', 'Mastery'],
    bonds: ["I'm loyal to my captain first, everything else second."],
    flaws: ["I follow orders, even if I think they're wrong."],
  },
  {
    id: 'soldier',
    name: 'Soldier',
    tagline: "Battle-hardened veteran with a soldier's discipline",
    imageUrl: backgroundImage('soldier'),
    symbolUrl: backgroundSymbol('soldier'),
    skillProficiencies: ['Athletics', 'Intimidation'],
    toolProficiencies: ['One type of gaming set', 'Vehicles (land)'],
    languages: 0,
    feature: {
      name: 'Military Rank',
      description:
        'You have a military rank from your career as a soldier. Soldiers loyal to your former military organization still recognize your authority and influence, and they defer to you if they are of a lower rank.',
    },
    equipment: [
      'Insignia of rank',
      'Trophy from fallen enemy',
      'Deck of cards',
      'Common clothes',
      '10 gp',
    ],
    personalityTraits: [
      "I'm always polite and respectful.",
      "I'm haunted by memories of war. I wake up every night screaming.",
    ],
    ideals: ['Greater Good', 'Responsibility', 'Nation'],
    bonds: ['I would still lay down my life for the people I served with.'],
    flaws: [
      'I made a terrible mistake in battle that cost many lives, and I would do anything to keep that mistake secret.',
    ],
  },
];
