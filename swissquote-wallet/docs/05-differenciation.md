# Différenciation

Beaucoup d'équipes proposeront un smart account EVM ou un split backup simple. Notre base (multisig Bitcoin 2 sur 3, modèle Bitkey) est éprouvée ; la différenciation vient de ce qu'on démontre et de la façon dont on répond aux questions pièges du brief.

## Les axes, par priorité

1. **Démo d'attaques refusées**, rejouées en direct avec la raison du refus :
   - voleur avec le téléphone déverrouillé qui tente de tout vider → palier 2, délai, le client annule ;
   - attaquant avec le **téléphone et l'e-mail** qui lance une récupération → pas de part CLIENT, refus (crédit bonus explicite du brief) ;
   - Swissquote + partenaire qui tentent de restaurer la clé de secours → combinaison SLIP-39 rejetée.
2. **« Swissquote a disparu » montré en direct** : on arrête le service Swissquote pendant la démo, le client sort avec téléphone + clé de secours. Le brief l'exige ; peu d'équipes le montreront vraiment.
3. **Invariants de custody testés automatiquement** (I1 à I7, voir `03-decisions.md`) : le modèle de menaces est exécutable, pas seulement écrit.
4. **Split backup utilisé là où il est sûr** : Swissquote n'a aucune part, la clé de secours n'est reconstituée que sur l'appareil du client. On répond aux deux questions pièges du brief au lieu de les subir.
5. **Continuité bancaire** pendant le délai de récupération (mockée) : accès plafonné via le compte Swissquote. Seul un acteur bancaire peut l'offrir.
6. **Travel Rule automatique** : Swissquote co-crée le wallet, donc la propriété est prouvée dès la création.

## À éviter

MPC, preuves ZK, multi-chaînes au cœur du projet : coût élevé, risque de casser l'histoire de bout en bout.

## Phrase de positionnement

« Vos bitcoins, vos clés, à un pas de votre compte : Swissquote vous protège sans jamais pouvoir agir sans vous, et si Swissquote disparaît, vous partez avec vos fonds. »
