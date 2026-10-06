import { Language, IncidentType } from '@prisma/client';
import { AlertTemplateDefinition, TemplateType } from './template.types';

export const INCIDENT_TYPE_TRANSLATIONS: Record<IncidentType, Record<Language, string>> = {
  [IncidentType.POSSIBLE_INTRUSION]: {
    [Language.ENGLISH]: 'Possible Intrusion',
    [Language.HAUSA]: 'Katsalandan / Baragada',
    [Language.IGBO]: 'Ntinye aka na-enweghi ikike',
    [Language.YORUBA]: 'Wole laigba ase',
    [Language.PIDGIN]: 'Person force enter compound',
  },
  [IncidentType.SUSPICIOUS_PERSON]: {
    [Language.ENGLISH]: 'Suspicious Person',
    [Language.HAUSA]: 'Mutum Mai Zargi',
    [Language.IGBO]: 'Onye a na-enyo enyo',
    [Language.YORUBA]: 'Eniyan Ifura',
    [Language.PIDGIN]: 'Suspicious Person',
  },
  [IncidentType.SUSPICIOUS_VEHICLE]: {
    [Language.ENGLISH]: 'Suspicious Vehicle',
    [Language.HAUSA]: 'Mota Mai Zargi',
    [Language.IGBO]: 'Ugbo ala a na-enyo enyo',
    [Language.YORUBA]: 'Oko ayokele Ifura',
    [Language.PIDGIN]: 'Suspicious Motor',
  },
  [IncidentType.FIRE]: {
    [Language.ENGLISH]: 'Fire Outbreak',
    [Language.HAUSA]: 'Gobara / Tashin Wuta',
    [Language.IGBO]: 'Oku Mberede',
    [Language.YORUBA]: 'Ina Ijona',
    [Language.PIDGIN]: 'Fire Outbreak',
  },
  [IncidentType.OTHER]: {
    [Language.ENGLISH]: 'Security Incident',
    [Language.HAUSA]: 'Matsalar Tsaro',
    [Language.IGBO]: 'Ihe Mberede Nchekwa',
    [Language.YORUBA]: 'Isele Aabo',
    [Language.PIDGIN]: 'Security Matter',
  },
};

export const ALERT_TEMPLATES: Record<TemplateType, Record<Language, AlertTemplateDefinition>> = {
  ALERT_VERIFIED_INCIDENT: {
    [Language.ENGLISH]: {
      type: 'ALERT_VERIFIED_INCIDENT',
      language: Language.ENGLISH,
      template:
        'AEGIS ALERT [{incidentNumber}]: Verified {type} reported near {areaName} at {time}. Stay indoors, remain vigilant and warn family.',
      reviewStatus: 'APPROVED',
      reviewerNotes: 'Production ready English early-warning template.',
    },
    [Language.HAUSA]: {
      type: 'ALERT_VERIFIED_INCIDENT',
      language: Language.HAUSA,
      template:
        'SANARWAR AEGIS [{incidentNumber}]: An tabbatar da {type} kusa da {areaName} da karfe {time}. Ku zauna a gida, ku kiyaye kuma ku sanar da iyali.',
      reviewStatus: 'APPROVED',
      reviewerNotes: 'Native Hausa speaker verified for Northern Nigerian communities.',
    },
    [Language.IGBO]: {
      type: 'ALERT_VERIFIED_INCIDENT',
      language: Language.IGBO,
      template:
        'NKWUKWU AEGIS [{incidentNumber}]: E kwadoro na {type} mere nso {areaName} n\'elekere {time}. Noro n\'ulo, muru anya ma gwa ndi ezinulo gi.',
      reviewStatus: 'NEEDS_NATIVE_REVIEW',
      reviewerNotes: 'Draft translation pending review by native Igbo linguist.',
    },
    [Language.YORUBA]: {
      type: 'ALERT_VERIFIED_INCIDENT',
      language: Language.YORUBA,
      template:
        'IKILO AEGIS [{incidentNumber}]: A ti fidi re mule pe {type} waye nitosi {areaName} ni aago {time}. Duro si ile, sora ki o si so fun awon ebi re.',
      reviewStatus: 'NEEDS_NATIVE_REVIEW',
      reviewerNotes: 'Draft translation pending review by native Yoruba linguist.',
    },
    [Language.PIDGIN]: {
      type: 'ALERT_VERIFIED_INCIDENT',
      language: Language.PIDGIN,
      template:
        'AEGIS ALERT [{incidentNumber}]: Confirmed {type} happen near {areaName} by {time}. Stay inside house, shine your eye and warn your family.',
      reviewStatus: 'NEEDS_NATIVE_REVIEW',
      reviewerNotes: 'Colloquial Nigerian Pidgin draft pending validation across regions.',
    },
  },

  ALL_CLEAR: {
    [Language.ENGLISH]: {
      type: 'ALL_CLEAR',
      language: Language.ENGLISH,
      template:
        'AEGIS UPDATE [{incidentNumber}]: All clear near {areaName} as of {time}. Security forces have resolved the incident. Stay safe.',
      reviewStatus: 'APPROVED',
      reviewerNotes: 'Production ready English all-clear template.',
    },
    [Language.HAUSA]: {
      type: 'ALL_CLEAR',
      language: Language.HAUSA,
      template:
        'SANARWAR AEGIS [{incidentNumber}]: Komai ya lafa kusa da {areaName} da karfe {time}. Jami\'an tsaro sun shawo kan lamarin. Ku kiyaye.',
      reviewStatus: 'APPROVED',
      reviewerNotes: 'Native Hausa speaker verified all-clear template.',
    },
    [Language.IGBO]: {
      type: 'ALL_CLEAR',
      language: Language.IGBO,
      template:
        'NKWUKWU AEGIS [{incidentNumber}]: Ihe niile adila mma nso {areaName} n\'elekere {time}. Ndi oru nchekwa edoziola nsogbu ahu. Noro na nchekwa.',
      reviewStatus: 'NEEDS_NATIVE_REVIEW',
      reviewerNotes: 'Draft Igbo all-clear template pending native verification.',
    },
    [Language.YORUBA]: {
      type: 'ALL_CLEAR',
      language: Language.YORUBA,
      template:
        'IKILO AEGIS [{incidentNumber}]: Gbogbo nkan ti bale nitosi {areaName} ni aago {time}. Awon agbofinro ti yanju isoro naa. E wa ni alaafia.',
      reviewStatus: 'NEEDS_NATIVE_REVIEW',
      reviewerNotes: 'Draft Yoruba all-clear template pending native verification.',
    },
    [Language.PIDGIN]: {
      type: 'ALL_CLEAR',
      language: Language.PIDGIN,
      template:
        'AEGIS UPDATE [{incidentNumber}]: Everywhere don calm down near {areaName} by {time}. Security people don settle everything. Stay safe.',
      reviewStatus: 'NEEDS_NATIVE_REVIEW',
      reviewerNotes: 'Draft Pidgin all-clear template pending regional review.',
    },
  },
};
