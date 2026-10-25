import campaign from '@/assets/microplan-campaign.jpg';
import admin from '@/assets/microplan-admin.jpg';
import flhf from '@/assets/microplan-flhf.jpg';
import community from '@/assets/microplan-community.jpg';
import settlement from '@/assets/microplan-settlement.jpg';
import terrain from '@/assets/microplan-terrain.jpg';
import population from '@/assets/microplan-population.jpg';
import disability from '@/assets/microplan-disability.jpg';
import trachoma from '@/assets/microplan-trachoma.jpg';
import cdd from '@/assets/microplan-cdd.jpg';
import notes from '@/assets/microplan-notes.jpg';
export const microplanArtwork: Record<string, { image: string; description: string; number: number }> = {
 campaign: { image: campaign, description: 'Year of microplanning and campaign details', number: 1 },
 admin: { image: admin, description: 'State, LGA and Ward selection', number: 2 },
 flhf: { image: flhf, description: 'Select facility and capture location', number: 3 },
 community: { image: community, description: 'Community details and leadership', number: 4 },
 settlement: { image: settlement, description: 'Settlement, main landmark and distance', number: 5 },
 terrain: { image: terrain, description: 'Physical terrain and access details', number: 6 },
 population: { image: population, description: 'Population estimates by age group', number: 7 },
 disability: { image: disability, description: 'Estimated number of persons with disability', number: 8 },
 trachoma: { image: trachoma, description: 'Trachoma-specific population data', number: 9 },
 cdd: { image: cdd, description: 'Community Directed Distributor details', number: 10 },
 notes: { image: notes, description: 'Any other relevant information', number: 11 },
};