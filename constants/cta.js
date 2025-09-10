// constants/cta.js
// CTAs centralisés. On peut changer libellés/liens ici sans toucher le moteur.

export const CTAS = {
  FAP: [
    {
      label: 'Trouver un Carter-Cash',
      href: 'https://auto.re-fap.fr/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=inline_oui',
      variant: 'primary'
    },
    {
      label: 'Trouver un garage partenaire Re-FAP',
      href: 'https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=inline_non',
      variant: 'secondary'
    }
  ],
  DIAG: [
    {
      label: 'Trouver un garage partenaire Re-FAP',
      href: 'https://re-fap.fr/trouver_garage_partenaire/?utm_source=autoai&utm_medium=cta&utm_campaign=v2&utm_content=diag_inline',
      variant: 'primary'
    }
  ]
};

export function getCTAs(category, triage) {
  if (triage) return [];            // jamais de CTA en phase questions
  return CTAS[category] || [];
}
