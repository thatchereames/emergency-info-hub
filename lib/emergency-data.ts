export type EmergencyInfo = {
  id: string;
  type: string;
  title: string;
  description: string;
  contact: string;
  updatedAt: string;
};

export const emergencyData: EmergencyInfo[] = [
  {
    id: "1",
    type: "fire",
    title: "Fire Emergency",
    description:
      "In case of fire, evacuate the building immediately and call the fire department.",
    contact: "911",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "2",
    type: "medical",
    title: "Medical Emergency",
    description:
      "For life-threatening medical emergencies, call emergency services immediately.",
    contact: "911",
    updatedAt: new Date().toISOString(),
  },
  {
    id: "3",
    type: "natural_disaster",
    title: "Natural Disaster",
    description:
      "Follow local authority instructions and seek shelter in a safe location.",
    contact: "FEMA: 1-800-621-3362",
    updatedAt: new Date().toISOString(),
  },
];
