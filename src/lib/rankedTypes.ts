import { PRELOADED_ARTIST_PHOTOS } from "./artistPhotos";

export interface RankedTier {
  name: "Bronce" | "Plata" | "Oro" | "Platino" | "Diamante" | "Maestro";
  minScore: number;
  badgeColor: string;
  badgeBg: string;
  icon: string;
}

export const RANKED_TIERS: RankedTier[] = [
  { name: "Maestro", minScore: 16000, badgeColor: "text-purple-400", badgeBg: "bg-purple-950/80 border-purple-500/50", icon: "👑" },
  { name: "Diamante", minScore: 12000, badgeColor: "text-cyan-400", badgeBg: "bg-cyan-950/80 border-cyan-500/50", icon: "💎" },
  { name: "Platino", minScore: 8500, badgeColor: "text-teal-300", badgeBg: "bg-teal-950/80 border-teal-500/50", icon: "⚡" },
  { name: "Oro", minScore: 5000, badgeColor: "text-amber-300", badgeBg: "bg-amber-950/80 border-amber-500/50", icon: "🏆" },
  { name: "Plata", minScore: 2500, badgeColor: "text-slate-300", badgeBg: "bg-slate-900/80 border-slate-400/50", icon: "🥈" },
  { name: "Bronce", minScore: 0, badgeColor: "text-amber-700", badgeBg: "bg-amber-950/40 border-amber-800/40", icon: "🥉" },
];

export function calculateTier(score: number): RankedTier {
  for (const tier of RANKED_TIERS) {
    if (score >= tier.minScore) {
      return tier;
    }
  }
  return RANKED_TIERS[RANKED_TIERS.length - 1];
}

export interface RankedCategory {
  id: string;
  name: string;
  kind: "artist" | "theme";
  description: string;
  imageUrl: string;
  query: string;
  playerCount: number;
}

export const RANKED_CATEGORIES: RankedCategory[] = [
  // Artistas
  {
    id: "artist_bad_bunny",
    name: "Bad Bunny",
    kind: "artist",
    description: "Demuestra si eres el fan #1 del conejo malo en todas sus eras",
    imageUrl: PRELOADED_ARTIST_PHOTOS["bad bunny"],
    query: "Bad Bunny",
    playerCount: 14200,
  },
  {
    id: "artist_quevedo",
    name: "Quevedo",
    kind: "artist",
    description: "Desde las islas al mundo: adivina todos los palos de Pedro",
    imageUrl: PRELOADED_ARTIST_PHOTOS["quevedo"],
    query: "Quevedo",
    playerCount: 11800,
  },
  {
    id: "artist_feid",
    name: "Feid / Ferxxo",
    kind: "artist",
    description: "Verde mor, gafas oscuras y los himnos que rompen las discos",
    imageUrl: PRELOADED_ARTIST_PHOTOS["feid"],
    query: "Feid",
    playerCount: 13500,
  },
  {
    id: "artist_myke_towers",
    name: "Myke Towers",
    kind: "artist",
    description: "Flow supremo, barras afiladas y hits mundiales sin descanso",
    imageUrl: PRELOADED_ARTIST_PHOTOS["myke towers"],
    query: "Myke Towers",
    playerCount: 8900,
  },
  {
    id: "artist_duki",
    name: "Duki",
    kind: "artist",
    description: "El pionero del trap latino y el rockstar de los estadios",
    imageUrl: PRELOADED_ARTIST_PHOTOS["duki"],
    query: "Duki",
    playerCount: 10400,
  },
  {
    id: "artist_mora",
    name: "Mora",
    kind: "artist",
    description: "Melodías espaciales, desamor futurista y producciones de otro planeta",
    imageUrl: PRELOADED_ARTIST_PHOTOS["mora"],
    query: "Mora",
    playerCount: 9100,
  },
  {
    id: "artist_rosalia",
    name: "Rosalía",
    kind: "artist",
    description: "Flamenco, vanguardia, reggaetón experimental y poder motomami",
    imageUrl: PRELOADED_ARTIST_PHOTOS["rosalía"],
    query: "Rosalía",
    playerCount: 12100,
  },
  {
    id: "artist_taylor_swift",
    name: "Taylor Swift",
    kind: "artist",
    description: "Todas las Eras: pop estelar, letras inolvidables y récords mundiales",
    imageUrl: PRELOADED_ARTIST_PHOTOS["taylor swift"],
    query: "Taylor Swift",
    playerCount: 17300,
  },
  {
    id: "artist_the_weeknd",
    name: "The Weeknd",
    kind: "artist",
    description: "Sintetizadores oscuros, R&B cinematográfico y mega éxitos de estadio",
    imageUrl: PRELOADED_ARTIST_PHOTOS["the weeknd"],
    query: "The Weeknd",
    playerCount: 15600,
  },
  {
    id: "artist_drake",
    name: "Drake",
    kind: "artist",
    description: "Hits legendarios, flow certified lover boy y dominador de charts",
    imageUrl: PRELOADED_ARTIST_PHOTOS["drake"],
    query: "Drake",
    playerCount: 12800,
  },
  {
    id: "artist_billie_eilish",
    name: "Billie Eilish",
    kind: "artist",
    description: "Susurros hipnóticos, bajos demoledores y producción de vanguardia",
    imageUrl: PRELOADED_ARTIST_PHOTOS["billie eilish"],
    query: "Billie Eilish",
    playerCount: 11400,
  },
  {
    id: "artist_eminem",
    name: "Eminem",
    kind: "artist",
    description: "Velocidad lírica imposible, clásicos de culto y rimas quirúrgicas",
    imageUrl: PRELOADED_ARTIST_PHOTOS["eminem"],
    query: "Eminem",
    playerCount: 13900,
  },
  {
    id: "artist_travis_scott",
    name: "Travis Scott",
    kind: "artist",
    description: "Puro hype, transiciones psicodélicas y sonido de festival mundial",
    imageUrl: PRELOADED_ARTIST_PHOTOS["travis scott"],
    query: "Travis Scott",
    playerCount: 9400,
  },
  {
    id: "artist_bizarrap",
    name: "Bizarrap",
    kind: "artist",
    description: "Las Music Sessions que paralizan internet en segundos",
    imageUrl: PRELOADED_ARTIST_PHOTOS["bizarrap"],
    query: "Bizarrap",
    playerCount: 11200,
  },

  // Temáticas
  {
    id: "theme_top_espana",
    name: "Top España 2026",
    kind: "theme",
    description: "Los mayores bombazos que suenan en cada rincón de España hoy",
    imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    query: "Quevedo Saiko Bad Bunny Aitana",
    playerCount: 22400,
  },
  {
    id: "theme_reggaeton",
    name: "Reggaetón Puro",
    kind: "theme",
    description: "Perreo de la vieja escuela y los hits modernos más prendidos",
    imageUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80",
    query: "Bad Bunny Feid Daddy Yankee Don Omar",
    playerCount: 18900,
  },
  {
    id: "theme_rap_under",
    name: "Rap & Trap Under",
    kind: "theme",
    description: "Barras crudas, beatmakers de culto y liricistas de la calle",
    imageUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
    query: "Cruz Cafuné Delaossa Recycled J Abhir Soto Asa",
    playerCount: 9500,
  },
  {
    id: "theme_pop_mundial",
    name: "Pop Mundial",
    kind: "theme",
    description: "Los números 1 indiscutibles de las listas de Billboard y Spotify",
    imageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    query: "Taylor Swift Dua Lipa The Weeknd Bruno Mars",
    playerCount: 14700,
  },
  {
    id: "theme_virales_tiktok",
    name: "Virales TikTok",
    kind: "theme",
    description: "Canciones que explotan en trends y coreografías virales",
    imageUrl: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&auto=format&fit=crop&q=80",
    query: "Gata Only Espresso Si Antes Te Hubiera Conocido",
    playerCount: 16800,
  },
  {
    id: "theme_clasicos_2010s",
    name: "Éxitos 2010s",
    kind: "theme",
    description: "Nostalgia inolvidable de la década dorada del pop electrónico",
    imageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
    query: "Avicii David Guetta Calvin Harris Rihanna Pitbull",
    playerCount: 13300,
  },
];

export interface LeaderboardEntry {
  userId: string;
  nickname: string;
  avatarUrl: string;
  score: number;
  rank: number;
  tier: RankedTier;
}
