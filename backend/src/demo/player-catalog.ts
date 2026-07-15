export type DemoPlayer = {
  id: string;
  name: string;
  initials: string;
  position: string;
  age: number;
  nationality: string;
  currentClub: string;
  overall: number;
  potential: number;
  marketValue: string;
  contractUntil: string;
  appearances: number;
  goals: number;
  assists: number;
  availability: "OPEN_TO_OFFERS" | "CLUB_APPROVAL_REQUIRED" | "SHORTLISTED";
  accent: string;
};

export const demoPlayers: readonly DemoPlayer[] = [
  {
    id: "mert-kaya",
    name: "Mert Kaya",
    initials: "MK",
    position: "Centre Forward",
    age: 22,
    nationality: "Türkiye",
    currentClub: "Bosphorus United",
    overall: 78,
    potential: 86,
    marketValue: "€8.4m",
    contractUntil: "2028",
    appearances: 28,
    goals: 17,
    assists: 6,
    availability: "OPEN_TO_OFFERS",
    accent: "#b7ef45",
  },
  {
    id: "lucas-azevedo",
    name: "Lucas Azevedo",
    initials: "LA",
    position: "Right Winger",
    age: 20,
    nationality: "Brazil",
    currentClub: "Lisbon Athletic",
    overall: 76,
    potential: 89,
    marketValue: "€11.2m",
    contractUntil: "2029",
    appearances: 31,
    goals: 9,
    assists: 13,
    availability: "CLUB_APPROVAL_REQUIRED",
    accent: "#f1c75b",
  },
  {
    id: "omar-diallo",
    name: "Omar Diallo",
    initials: "OD",
    position: "Defensive Midfielder",
    age: 24,
    nationality: "Senegal",
    currentClub: "Dakar Étoile",
    overall: 80,
    potential: 83,
    marketValue: "€9.7m",
    contractUntil: "2027",
    appearances: 33,
    goals: 3,
    assists: 8,
    availability: "SHORTLISTED",
    accent: "#68c9ff",
  },
  {
    id: "kenji-sato",
    name: "Kenji Sato",
    initials: "KS",
    position: "Left Back",
    age: 21,
    nationality: "Japan",
    currentClub: "Yokohama Waves",
    overall: 75,
    potential: 87,
    marketValue: "€6.9m",
    contractUntil: "2028",
    appearances: 30,
    goals: 2,
    assists: 11,
    availability: "OPEN_TO_OFFERS",
    accent: "#ff776d",
  },
  {
    id: "sofia-alvarez",
    name: "Sofia Alvarez",
    initials: "SA",
    position: "Attacking Midfielder",
    age: 23,
    nationality: "Spain",
    currentClub: "Valencia Femenino",
    overall: 81,
    potential: 88,
    marketValue: "€10.5m",
    contractUntil: "2028",
    appearances: 29,
    goals: 10,
    assists: 15,
    availability: "OPEN_TO_OFFERS",
    accent: "#d9a7ff",
  },
  {
    id: "amina-yilmaz",
    name: "Amina Yılmaz",
    initials: "AY",
    position: "Goalkeeper",
    age: 25,
    nationality: "Türkiye",
    currentClub: "Anatolia SK",
    overall: 82,
    potential: 85,
    marketValue: "€7.8m",
    contractUntil: "2027",
    appearances: 26,
    goals: 0,
    assists: 1,
    availability: "CLUB_APPROVAL_REQUIRED",
    accent: "#ff9f68",
  },
];

export function playerById(id: string): DemoPlayer {
  const player = demoPlayers.find((candidate) => candidate.id === id);
  if (!player) throw new Error(`Unknown player: ${id}`);
  return player;
}
