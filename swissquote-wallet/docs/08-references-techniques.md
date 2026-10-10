# Références techniques

Adresses relevées dans les documentations officielles lors de la recherche. **À revérifier sur Etherscan (Base Sepolia, id 84532) avant de les utiliser.**

| Brique | Adresse |
|---|---|
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Candide SocialRecoveryModule, délai 3 minutes (tests) | `0x949d01d424bE050D09C16025dd007CB59b3A8c66` |
| Candide SocialRecoveryModule, 3 jours | `0x38275826E1933303E508433dD5f289315Da2541c` |
| Candide SocialRecoveryModule, 7 jours | `0x088f6cfD8BB1dDb1BB069CCb3fc1A98927D233f2` |
| Candide SocialRecoveryModule, 14 jours | `0x9BacD92F4687Db306D7ded5d4513a51EA05df25b` |
| Safe passkeys v0.2.1, SafeWebAuthnSharedSigner | `0x94a4F6affBd8975951142c3999aEAB7ecee555c2` |
| Safe passkeys v0.2.1, SignerSingleton | `0x4E27b51350e6c2083EE19011120F50DAfEc5CA50` |
| Safe passkeys v0.2.1, SignerFactory | `0x1d31F259eE307358a26dFb23EB365939E8641195` |
| DaimoP256Verifier | `0xc2b78104907F722DABAc4C69f826a522B2754De4` |
| Zodiac Roles 2.1.1, mastercopy | `0xF2964CE6161ce0e75964Fe7927cE114cb0B283D5` |
| Module Proxy Factory 1.2.0 | `0x000000000000aDdB49795b0f9bA5BC298cDda236` |
| Pimlico, paymaster ERC-20 | `0x777777777777AeC03fd955926DbF81597e66834C` |
| USDC (Base Sepolia) | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |

## Notes techniques

- Précompile P-256 (RIP-7212 / EIP-7951) à l'adresse `0x100`. Présent sur Base depuis Fjord ; à confirmer sur Base Sepolia par une vraie UserOp, car un `eth_call` statique peut donner de faux positifs sur testnet.
- Safe passkeys : le module partagé lie l'adresse à une passkey qui peut être perdue ; prévoir un second moyen d'accès.
- Candide SocialRecoveryModule : confirmer / exécuter / finaliser (appelable par n'importe qui) / annuler (réservé au compte).
- Zodiac Roles v2.1.1 et Delay Modifier : composition Safe → Delay → Roles. Les rôles ne s'appliquent pas aux propriétaires du Safe.
- Argent : approche à retenir pour la vérification par emojis.
