# Différenciation

Risque : la plupart des équipes arriveront à Safe + passkey + gardiens + paymaster. La technologie de base doit rester standard pour que le flux de bout en bout marche (35 points techniques et 20 points de bonus). La différenciation vient de ce que les autres traiteront en surface.

## Les trois axes, par priorité

1. **Démo d'attaques qui échouent.** En plus du chemin heureux, trois attaques rejouées en direct et rejetées par le contrat, visibles sur l'explorateur :
   - téléphone volé qui tente de vider le compte ;
   - téléphone et e-mail piratés qui tentent une récupération ;
   - banque ou gardien malveillant qui agit seul.
   Coût faible : les tests Foundry servent de base. Vise les 20 points de sécurité.
2. **Veto indépendant.** Clé de veto enregistrée à l'avance sur un second appareil, qui peut geler ou annuler une récupération mais jamais déplacer des fonds. Comble une limite du module Candide (annulation réservée au propriétaire).
3. **Continuité bancaire.** Pendant le délai de récupération, accès plafonné via le compte bancaire (fiat, carte). Mocké en démo. Pèse sur le business case et le pitch. À coupler avec le récit juridique (FINMA, LBA, KYC déjà réalisé par la banque).

## À éviter

MPC, preuves ZK, multi-chaînes : coût élevé, risque de casser le flux de bout en bout, et ce n'est pas ce que Swissquote cherche à mettre en production.

## Phrase de positionnement

« Une récupération de wallet où la banque est un gardien borné, dont chaque action est vérifiable en chaîne, et que nous avons attaqué en direct pour le prouver. »
