const MAP: Record<string, string> = {
  afghanistan:'AF',albania:'AL',algeria:'DZ',andorra:'AD',angola:'AO',
  argentina:'AR',armenia:'AM',australia:'AU',austria:'AT',azerbaijan:'AZ',
  bahamas:'BS',bahrain:'BH',bangladesh:'BD',belarus:'BY',belgium:'BE',
  belize:'BZ',benin:'BJ',bhutan:'BT',bolivia:'BO',bosnia:'BA',
  botswana:'BW',brazil:'BR',brunei:'BN',bulgaria:'BG',burkinafaso:'BF',
  burkina:'BF',burundi:'BI',cambodia:'KH',cameroon:'CM',canada:'CA',
  chad:'TD',chile:'CL',china:'CN',colombia:'CO',comoros:'KM',congo:'CG',
  croatia:'HR',cuba:'CU',cyprus:'CY',czechia:'CZ','czech republic':'CZ',
  denmark:'DK',djibouti:'DJ',dominica:'DM','dominican republic':'DO',
  ecuador:'EC',egypt:'EG',elsalvador:'SV',eritrea:'ER',estonia:'EE',
  eswatini:'SZ',ethiopia:'ET',finland:'FI',france:'FR',gabon:'GA',
  gambia:'GM',georgia:'GE',germany:'DE',ghana:'GH',greece:'GR',
  grenada:'GD',guatemala:'GT',guinea:'GN',guyana:'GY',haiti:'HT',
  honduras:'HN',hungary:'HU',iceland:'IS',india:'IN',indonesia:'ID',
  iran:'IR',iraq:'IQ',ireland:'IE',israel:'IL',italy:'IT',jamaica:'JM',
  japan:'JP',jordan:'JO',kenya:'KE',kuwait:'KW',kazakhstan:'KZ',
  kyrgyzstan:'KG',laos:'LA',latvia:'LV',lebanon:'LB',lesotho:'LS',
  liberia:'LR',libya:'LY',lithuania:'LT',luxembourg:'LU',madagascar:'MG',
  malawi:'MW',malaysia:'MY',maldives:'MV',mali:'ML',malta:'MT',
  mexico:'MX',moldova:'MD',monaco:'MC',mongolia:'MN',montenegro:'ME',
  morocco:'MA',mozambique:'MZ',myanmar:'MM',namibia:'NA',nepal:'NP',
  netherlands:'NL',newzealand:'NZ',nicaragua:'NI',niger:'NE',nigeria:'NG',
  northmacedonia:'MK',norway:'NO',oman:'OM',pakistan:'PK',panama:'PA',
  paraguay:'PY',peru:'PE',philippines:'PH',poland:'PL',portugal:'PT',
  qatar:'QA',romania:'RO',russia:'RU',rwanda:'RW',samoa:'WS',
  senegal:'SN',serbia:'RS',seychelles:'SC',singapore:'SG',slovakia:'SK',
  slovenia:'SI',somalia:'SO',southafrica:'ZA',spain:'ES',srilanka:'LK',
  sudan:'SD',sweden:'SE',switzerland:'CH',syria:'SY',taiwan:'TW',
  tajikistan:'TJ',tanzania:'TZ',thailand:'TH',togo:'TG',tunisia:'TN',
  turkey:'TR',uganda:'UG',ukraine:'UA','united arab emirates':'AE',
  'united kingdom':'GB','united states':'US',uruguay:'UY',uzbekistan:'UZ',
  venezuela:'VE',vietnam:'VN',yemen:'YE',zambia:'ZM',zimbabwe:'ZW',
};

/** Accepts a full country name ("Kenya") or existing 2-letter code ("KE"/"ke").
 *  Returns a lowercase ISO-3166-1 alpha-2 code, or "" if unrecognised. */
export function countryToIso(country?: string): string {
  if (!country) return '';
  const trimmed = country.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toLowerCase();
  const cleaned = trimmed.toLowerCase().replace(/[^a-z\s]/g, '').trim();
  const code = MAP[cleaned] ?? MAP[cleaned.replace(/\s+/g, '')];
  return code ? code.toLowerCase() : '';
}
