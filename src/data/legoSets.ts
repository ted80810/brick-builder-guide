export interface LegoSet {
  id: string;
  name: string;
  setNumber: string;
  category: "classic" | "creator" | "technic" | "city" | "architecture" | "ideas" | "friends" | "ninjago" | "star-wars" | "other";
  pieceCount: number;
  description: string;
}

export const LEGO_SETS: LegoSet[] = [
  // Classic / Creative Boxes
  { id: "10698", setNumber: "10698", name: "Large Creative Brick Box", category: "classic", pieceCount: 790, description: "Broad variety of bricks in 33 colors" },
  { id: "11717", setNumber: "11717", name: "Bricks Bricks Plates", category: "classic", pieceCount: 1504, description: "Mix of bricks, plates, eyes, wheels" },
  { id: "10696", setNumber: "10696", name: "Medium Creative Brick Box", category: "classic", pieceCount: 484, description: "35 colors with baseplates and wheels" },
  { id: "11013", setNumber: "11013", name: "Creative Transparent Bricks", category: "classic", pieceCount: 500, description: "Transparent and solid bricks mix" },
  { id: "11014", setNumber: "11014", name: "Bricks and Wheels", category: "classic", pieceCount: 653, description: "Wheels, tires, axles, and bricks" },
  { id: "11030", setNumber: "11030", name: "Lots of Bricks", category: "classic", pieceCount: 1000, description: "1000 bricks in vibrant colors" },
  { id: "11024", setNumber: "11024", name: "Grey Baseplate", category: "classic", pieceCount: 1, description: "32x32 stud grey baseplate" },
  { id: "10700", setNumber: "10700", name: "Green Baseplate", category: "classic", pieceCount: 1, description: "32x32 stud green baseplate" },
  { id: "11023", setNumber: "11023", name: "Green Baseplate (2023)", category: "classic", pieceCount: 1, description: "32x32 stud green baseplate" },
  { id: "10713", setNumber: "10713", name: "Creative Suitcase", category: "classic", pieceCount: 213, description: "Portable suitcase with bricks" },
  { id: "10692", setNumber: "10692", name: "Creative Bricks", category: "classic", pieceCount: 221, description: "Starter creative brick set" },

  // Creator 3-in-1
  { id: "31058", setNumber: "31058", name: "Mighty Dinosaurs", category: "creator", pieceCount: 174, description: "T. rex, Triceratops, or Pterodactyl" },
  { id: "31109", setNumber: "31109", name: "Pirate Ship", category: "creator", pieceCount: 1264, description: "Pirate Ship, Inn, or Skull Island" },
  { id: "31120", setNumber: "31120", name: "Medieval Castle", category: "creator", pieceCount: 1426, description: "Castle, tower, or marketplace" },
  { id: "31208", setNumber: "31208", name: "Hokusai – The Great Wave", category: "creator", pieceCount: 1810, description: "Japanese art wall decoration" },
  { id: "31139", setNumber: "31139", name: "Cozy House", category: "creator", pieceCount: 808, description: "Family home with 3 build options" },
  { id: "31140", setNumber: "31140", name: "Magical Unicorn", category: "creator", pieceCount: 145, description: "Unicorn, seahorse, or peacock" },
  { id: "31141", setNumber: "31141", name: "Main Street", category: "creator", pieceCount: 1459, description: "Art deco building or market street" },
  { id: "31143", setNumber: "31143", name: "Birdhouse", category: "creator", pieceCount: 476, description: "Birdhouse, beehive, or hedgehog" },
  { id: "31145", setNumber: "31145", name: "Red Dragon", category: "creator", pieceCount: 149, description: "Dragon, fish, or phoenix" },
  { id: "31146", setNumber: "31146", name: "Flatbed Truck with Helicopter", category: "creator", pieceCount: 270, description: "Truck and helicopter combo" },
  { id: "31150", setNumber: "31150", name: "Wild Safari Animals", category: "creator", pieceCount: 780, description: "Giraffe, gazelles, or lion" },
  { id: "31152", setNumber: "31152", name: "Space Astronaut", category: "creator", pieceCount: 647, description: "Astronaut, dog, or jet" },
  { id: "31153", setNumber: "31153", name: "Modern House", category: "creator", pieceCount: 939, description: "3-story modern home" },
  { id: "31155", setNumber: "31155", name: "Hamster Wheel", category: "creator", pieceCount: 416, description: "Hamster, cat, or dog build" },
  { id: "31157", setNumber: "31157", name: "Exotic Peacock", category: "creator", pieceCount: 355, description: "Peacock, dragonfly, or butterfly" },

  // Technic
  { id: "42151", setNumber: "42151", name: "Bugatti Bolide", category: "technic", pieceCount: 905, description: "Technic Bugatti Bolide car" },
  { id: "42115", setNumber: "42115", name: "Lamborghini Sián FKP 37", category: "technic", pieceCount: 3696, description: "1:8 scale Lamborghini supercar" },
  { id: "42083", setNumber: "42083", name: "Bugatti Chiron", category: "technic", pieceCount: 3599, description: "1:8 scale Bugatti Chiron" },
  { id: "42145", setNumber: "42145", name: "Airbus H175 Rescue Helicopter", category: "technic", pieceCount: 2001, description: "Motorised rescue helicopter" },
  { id: "42141", setNumber: "42141", name: "McLaren Formula 1 Race Car", category: "technic", pieceCount: 1432, description: "2022 McLaren F1 car" },

  // City
  { id: "60349", setNumber: "60349", name: "Lunar Space Station", category: "city", pieceCount: 500, description: "Modular space station" },
  { id: "60337", setNumber: "60337", name: "Express Passenger Train", category: "city", pieceCount: 764, description: "Remote-control passenger train" },
  { id: "60316", setNumber: "60316", name: "Police Station", category: "city", pieceCount: 668, description: "3-level police station" },
  { id: "60388", setNumber: "60388", name: "Gaming Tournament Truck", category: "city", pieceCount: 344, description: "Esports gaming truck" },
  { id: "60398", setNumber: "60398", name: "Family House and Electric Car", category: "city", pieceCount: 462, description: "Modern family house" },

  // Architecture
  { id: "21054", setNumber: "21054", name: "The White House", category: "architecture", pieceCount: 1483, description: "Detailed White House model" },
  { id: "21060", setNumber: "21060", name: "Himeji Castle", category: "architecture", pieceCount: 2125, description: "Japanese castle landmark" },
  { id: "21034", setNumber: "21034", name: "London Skyline", category: "architecture", pieceCount: 468, description: "London landmarks skyline" },

  // Ideas
  { id: "21327", setNumber: "21327", name: "Typewriter", category: "ideas", pieceCount: 2079, description: "Working typewriter model" },
  { id: "21318", setNumber: "21318", name: "Tree House", category: "ideas", pieceCount: 3036, description: "Detailed tree house" },
  { id: "21330", setNumber: "21330", name: "Home Alone", category: "ideas", pieceCount: 3955, description: "McCallister house from Home Alone" },

  // Star Wars
  { id: "75192", setNumber: "75192", name: "Millennium Falcon", category: "star-wars", pieceCount: 7541, description: "UCS Millennium Falcon" },
  { id: "75375", setNumber: "75375", name: "Millennium Falcon (2024)", category: "star-wars", pieceCount: 921, description: "Mid-scale Millennium Falcon" },
  { id: "75341", setNumber: "75341", name: "Luke Skywalker's Landspeeder", category: "star-wars", pieceCount: 1890, description: "UCS Landspeeder" },

  // Friends
  { id: "41760", setNumber: "41760", name: "Igloo Holiday Adventure", category: "friends", pieceCount: 491, description: "Winter igloo with sled" },
  { id: "41757", setNumber: "41757", name: "Botanical Garden", category: "friends", pieceCount: 1072, description: "Greenhouse with plants" },

  // Ninjago
  { id: "71799", setNumber: "71799", name: "NINJAGO City Markets", category: "ninjago", pieceCount: 6163, description: "Detailed market city" },
  { id: "71741", setNumber: "71741", name: "NINJAGO City Gardens", category: "ninjago", pieceCount: 5685, description: "Tall modular city" },
];

export const LEGO_SET_CATEGORIES = [
  { id: "classic", label: "Classic / Creative", emoji: "🧱" },
  { id: "creator", label: "Creator 3-in-1", emoji: "🏗️" },
  { id: "technic", label: "Technic", emoji: "⚙️" },
  { id: "city", label: "City", emoji: "🏙️" },
  { id: "architecture", label: "Architecture", emoji: "🏛️" },
  { id: "ideas", label: "Ideas", emoji: "💡" },
  { id: "star-wars", label: "Star Wars", emoji: "⭐" },
  { id: "friends", label: "Friends", emoji: "🌸" },
  { id: "ninjago", label: "Ninjago", emoji: "🥷" },
] as const;
