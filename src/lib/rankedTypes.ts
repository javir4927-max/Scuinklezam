export interface RankedTier {
  name: "Bronce" | "Plata" | "Oro" | "Platino" | "Diamante" | "Maestro";
  minScore: number;
  badgeColor: string;
  badgeBg: string;
  icon: string;
}

// Calibrated for 10 questions / 1000 max points
export const RANKED_TIERS: RankedTier[] = [
  { name: "Maestro", minScore: 900, badgeColor: "text-purple-400", badgeBg: "bg-purple-950/80 border-purple-500/50", icon: "👑" },
  { name: "Diamante", minScore: 800, badgeColor: "text-cyan-400", badgeBg: "bg-cyan-950/80 border-cyan-500/50", icon: "💎" },
  { name: "Platino", minScore: 700, badgeColor: "text-teal-300", badgeBg: "bg-teal-950/80 border-teal-500/50", icon: "⚡" },
  { name: "Oro", minScore: 550, badgeColor: "text-amber-300", badgeBg: "bg-amber-950/80 border-amber-500/50", icon: "🏆" },
  { name: "Plata", minScore: 400, badgeColor: "text-slate-300", badgeBg: "bg-slate-900/80 border-slate-400/50", icon: "🥈" },
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
  // Artistas España & Urbanos
  {
    id: "artist_quevedo",
    name: "Quevedo",
    kind: "artist",
    description: "Desde las islas al mundo: adivina todos los himnos de Pedro",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Quevedo"),
    query: "Quevedo",
    playerCount: 0,
  },
  {
    id: "artist_saiko",
    name: "Saiko",
    kind: "artist",
    description: "Supernova, trap melódico granadino y los hits que dominan España",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Saiko"),
    query: "Saiko",
    playerCount: 0,
  },
  {
    id: "artist_lucho_rk",
    name: "Lucho RK",
    kind: "artist",
    description: "Puro flow canario, barras frescas y melodías callejeras de culto",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Lucho RK"),
    query: "Lucho RK",
    playerCount: 0,
  },
  {
    id: "artist_jc_reyes",
    name: "JC Reyes",
    kind: "artist",
    description: "La calle en cada beat: el sonido gitano-urbano más viral",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("JC Reyes"),
    query: "JC Reyes",
    playerCount: 0,
  },
  {
    id: "artist_cruzzi",
    name: "Cruzzi",
    kind: "artist",
    description: "El de Tenerife: clásicos de Cruzzi, Moonlight922 y colaboraciones",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Cruzzi"),
    query: "Cruzzi",
    playerCount: 0,
  },
  {
    id: "artist_delaossa",
    name: "Delaossa",
    kind: "artist",
    description: "El orgullo de El Palo: barras honestas y nostalgia malagueña",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Delaossa"),
    query: "Delaossa",
    playerCount: 0,
  },
  {
    id: "artist_hoke",
    name: "Hoke",
    kind: "artist",
    description: "BBO, rimas olímpicas y el rap de culto que marcó una generación",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Hoke"),
    query: "Hoke",
    playerCount: 0,
  },
  {
    id: "artist_morad",
    name: "Morad",
    kind: "artist",
    description: "La voz de La Florida: drill callejero, lealtad y millones de oyentes",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Morad"),
    query: "Morad",
    playerCount: 0,
  },
  {
    id: "artist_bad_gyal",
    name: "Bad Gyal",
    kind: "artist",
    description: "Dancehall catalán, perreo puro y actitud de reina de la noche",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Bad Gyal"),
    query: "Bad Gyal",
    playerCount: 0,
  },
  {
    id: "artist_rosalia",
    name: "Rosalía",
    kind: "artist",
    description: "Flamenco, vanguardia, reggaetón experimental y poder motomami",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Rosalía"),
    query: "Rosalía",
    playerCount: 0,
  },

  // Artistas Latinos
  {
    id: "artist_bad_bunny",
    name: "Bad Bunny",
    kind: "artist",
    description: "Demuestra si eres el fan #1 del conejo malo en todas sus eras",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Bad Bunny"),
    query: "Bad Bunny",
    playerCount: 0,
  },
  {
    id: "artist_feid",
    name: "Feid",
    kind: "artist",
    description: "Verde mor, gafas oscuras y los himnos que rompen las discos",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Feid"),
    query: "Feid",
    playerCount: 0,
  },
  {
    id: "artist_myke_towers",
    name: "Myke Towers",
    kind: "artist",
    description: "Flow supremo, barras afiladas y hits mundiales sin descanso",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Myke Towers"),
    query: "Myke Towers",
    playerCount: 0,
  },
  {
    id: "artist_mora",
    name: "Mora",
    kind: "artist",
    description: "Melodías espaciales, desamor futurista y producciones de otro planeta",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Mora"),
    query: "Mora",
    playerCount: 0,
  },
  {
    id: "artist_duki",
    name: "Duki",
    kind: "artist",
    description: "El pionero del trap latino y el rockstar de los estadios",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Duki"),
    query: "Duki",
    playerCount: 0,
  },
  {
    id: "artist_bizarrap",
    name: "Bizarrap",
    kind: "artist",
    description: "Las Music Sessions que paralizan internet en segundos",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Bizarrap"),
    query: "Bizarrap",
    playerCount: 0,
  },

  // Artistas Globales
  {
    id: "artist_the_weeknd",
    name: "The Weeknd",
    kind: "artist",
    description: "Sintetizadores oscuros, R&B cinematográfico y mega éxitos de estadio",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("The Weeknd"),
    query: "The Weeknd",
    playerCount: 0,
  },
  {
    id: "artist_taylor_swift",
    name: "Taylor Swift",
    kind: "artist",
    description: "Todas las Eras: pop estelar, letras inolvidables y récords mundiales",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Taylor Swift"),
    query: "Taylor Swift",
    playerCount: 0,
  },
  {
    id: "artist_billie_eilish",
    name: "Billie Eilish",
    kind: "artist",
    description: "Susurros hipnóticos, bajos demoledores y producción de vanguardia",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Billie Eilish"),
    query: "Billie Eilish",
    playerCount: 0,
  },
  {
    id: "artist_travis_scott",
    name: "Travis Scott",
    kind: "artist",
    description: "Puro hype, transiciones psicodélicas y sonido de festival mundial",
    imageUrl: "/api/artists/photo?name=" + encodeURIComponent("Travis Scott"),
    query: "Travis Scott",
    playerCount: 0,
  },

  // Temáticas Reales
  {
    id: "theme_viral_espana",
    name: "Viral España",
    kind: "theme",
    description: "Exclusivamente lo más viral que suena en las fiestas y listas de España",
    imageUrl: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80",
    query: "Quevedo Saiko JC Reyes Lucho RK Bad Gyal Omar Montes",
    playerCount: 0,
  },
  {
    id: "theme_top_espana",
    name: "Top España",
    kind: "theme",
    description: "Los mayores bombazos nacionales que lideran las listas en España",
    imageUrl: "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=600&auto=format&fit=crop&q=80",
    query: "Quevedo Morad Aitana Lola Indigo Rels B Cano",
    playerCount: 0,
  },
  {
    id: "theme_under_espana",
    name: "Under Español / Urbano",
    kind: "theme",
    description: "Barras crudas, beatmakers de culto y liricistas de la escena urbana",
    imageUrl: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
    query: "Cruzzi Delaossa Hoke Lucho RK Soto Asa Gloosito",
    playerCount: 0,
  },
  {
    id: "theme_reggaeton",
    name: "Reggaetón Puro",
    kind: "theme",
    description: "Perreo de la vieja escuela y los hits modernos más prendidos",
    imageUrl: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80",
    query: "Bad Bunny Feid Myke Towers Rauw Alejandro Karol G",
    playerCount: 0,
  },
  {
    id: "theme_trap_argentino",
    name: "Trap Argentino / Cono Sur",
    kind: "theme",
    description: "El movimiento que revolucionó la música urbana mundial",
    imageUrl: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80",
    query: "Duki Bizarrap YSY A KHEA Trueno Milo J",
    playerCount: 0,
  },
  {
    id: "theme_pop_mundial",
    name: "Pop Mundial / Hits",
    kind: "theme",
    description: "Los números 1 indiscutibles de las listas de Billboard y Spotify",
    imageUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80",
    query: "The Weeknd Taylor Swift Dua Lipa Billie Eilish Bruno Mars",
    playerCount: 0,
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
