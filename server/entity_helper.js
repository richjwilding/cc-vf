import parseFullName from 'parse-full-name';
import Fuse from 'fuse.js';
import { parse } from 'dotenv';
import { queryCBPersonRelatedOrganizations } from './crunchbase_helper';

// List of names
const _names = [
  /*'Dr. John A. Smith III',
  'María de los Ángeles López',
  'Juan Carlos Ramirez',
  'Prof. James T. Johnson, PhD',
  'James Johnson',
  'Mr. 王伟',
  'Her Royal Highness Princess Diana',
  'Princess Diana',
  'HRH Princess Diana',
  'HRH Princess Di',
  'Sr. Juan Carlos Ramirez',
  'Dr. Ludwig van Beethoven',
  'Miss Amelia Earhart',
  'Mme. Marie Curie',
  'Miss A. Earhart',
  'Sheikh Mohammed bin Rashid Al Maktoum',
  'Edmar Ramos de Oliveira Filho'*/
  "R.V.B. Oliveira",
"Tássylla Oliveira Fonseca",
"E. G. Oliveira",
"Letícia Oliveira Bispo Cardoso",
"Letícia Oliveira de Souza",
"Jaqueline V. Oliveira",
"Jaqueline V. Oliveira",
"da Silva",
"Alan da Silva Esteves, PhD",
"Thiago da Silva Ribeiro",
"Dionisio da Silva Biron",
"Josean da Silva Lima Junior",
"da Silva, T. A.",
"R. G. DA SILVA",
"Renan B. da Silva",
"Jaqueline R. Da Silva",
"Jaqueline R. Da Silva",
"Jaqueline R. Da Silva",
"SILVA, Josielly Braz da",
"Renan Borges da Silva",
"Richard Felipe da Silva",
"Da Silva, J. L. F.",
"Maíra Martins da Silva",
"Crístian Jean da Silva Pens",
"Daniella Pereira da Silva",
"Diogo Silva Pellosi",
"Josana Carla da Silva Sasaki",
"Edilene Assunção da Silva",
"Luiza Helena da Silva Martins",
"Adriana Silva Franca"
];

// Function to normalize name components and include original index
  
  // Initialize Fuse.js with a slightly higher threshold for full name matching
  
  // Function to group similar names using Fuse.js
  const groupSimilarNames = (names, fuseFullName, fuseCore) => {
    let out_list = []
    const processedIndices = new Set();
  
    names.forEach((nameObj) => {
      if (processedIndices.has(nameObj.index)) return;
  
      // Exact match search using full name
      const searchResultFull = fuseFullName.search(nameObj.fullName);
      const exactMatches = searchResultFull.filter(result => result.item.index !== nameObj.index && result.score < 0.05).map(result => result.item);
  
      
      // Fuzzy match search using core and abbreviated names if no exact match found
      let similarNames = exactMatches;
      if (exactMatches.length === 0) {
        const searchResultCore = fuseCore.search(nameObj.coreName);
        const searchResultAbbrev = fuseCore.search(nameObj.abbreviatedName);
 //       const searchResultAbbrev2 = fuseCore.search(nameObj.abbreviatedName2);
  
        const similarNamesCore = searchResultCore.filter(result => result.item.index !== nameObj.index && result.score < 0.02).map(result => result.item);
        similarNames = [...new Set(similarNamesCore)];
        /*if( nameObj.first.length === 1){
          const similarNamesAbbrev = searchResultAbbrev.filter(result => result.item.index !== nameObj.index && result.score < 0.05).map(result => result.item);
          similarNames = [...new Set([...similarNamesCore, ...similarNamesAbbrev])];
        }else{

        }*/
        //const similarNamesAbbrev2 = searchResultAbbrev2.filter(result => result.score < 0.1).map(result => result.item);
  
        //similarNames = [...new Set([...similarNamesCore, ...similarNamesAbbrev, ...similarNamesAbbrev2])];
      }
  
      const allNames = [nameObj, similarNames].flat()
      const lead = allNames.reduce((a,c)=>a.quoted.length > c.quoted.length ? a : c)
      for(const nameObj of allNames ){
        const out = {}
        if( lead.index !== nameObj.index ){
          out.oringalFullName = nameObj.quoted
        }
        out.quoted = lead.quoted
        out.first =lead.first
        out.last = lead.last
        out.index = nameObj.index
        out_list[out.index] = out
      }
    });
  
    return out_list
  };

export async function loopkupOrganizationsForAcademic( primitive ){
  const people = [primitive?.referenceParameters?.authors,primitive?.referenceParameters?.advisors].flat().filter(d=>d)
  const institutes = primitive?.referenceParameters?.institutes

  if( !people?.length || !institutes?.length){
    return undefined
  }
  const institution = institutes[0]?.name ?? institutes[0]
  const names = people.map(d=>{
    const parsed = parseFullName.parseFullName(d)
    if( parsed.first && parsed.last){
      return {first: parsed.first, last: parsed.last}
    }
  }).filter(d=>d)
  for(const name of names){
    const organizations = await queryCBPersonRelatedOrganizations( name.first, name.last, {contains: institution})
  }

}
  
export async function resolveNameTest(names){

    
  const normalizeName = (name, index) => {
    const parsed = parseFullName.parseFullName(name)
    const normalizedFirstName = parsed.first ? parsed.first.toLowerCase() : '';
    const normalizedMiddleName = parsed.middle ? parsed.middle.toLowerCase() : '';
    const normalizedLastName = parsed.last ? parsed.last.toLowerCase() : '';
    const abbreviatedFirstName = normalizedFirstName.charAt(0);
  
    return {
      index,
      first: normalizedFirstName,
      last: normalizedLastName,
      quoted: name,
      fullName: `${parsed.title ? parsed.title.toLowerCase() + ' ' : ''}${normalizedFirstName} ${normalizedMiddleName} ${normalizedLastName}${parsed.suffix ? ' ' + parsed.suffix.toLowerCase() : ''}`.trim(),
      coreName: `${normalizedFirstName} ${normalizedMiddleName} ${normalizedLastName}`.trim(),
      abbreviatedName: `${abbreviatedFirstName} ${normalizedMiddleName} ${normalizedLastName}`.trim(),
    };
  };
  
  // Normalize all names with their original index
  const flattenedNames = names.map((name, index) => normalizeName(name, index));
    // Get grouped names
  const fuseFullName = new Fuse(flattenedNames, {
    keys: ['fullName'],
    includeScore: true,
    threshold: 0.1 // High sensitivity for exact matching
  });
  
  // Initialize Fuse.js with a slightly lower threshold for core and abbreviated name matching
  const fuseCore = new Fuse(flattenedNames, {
    keys: ['coreName', 'abbreviatedName','abbreviatedName2'],
    includeScore: true,
    threshold: 0.3 // Lower sensitivity for fuzzy matching
  });

    const normalizedNames = groupSimilarNames(flattenedNames, fuseFullName, fuseCore);

    console.log(normalizedNames)
    
} 

export async function findCompaniesFromAcademic( list ){
  

}