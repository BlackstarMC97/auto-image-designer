# MboaGeek — Générateur d'images OG

Applique automatiquement l'habillage MboaGeek (overlay crème + logo + titre + sous-titre + URL)
sur une image de base générée par meta.ai. En unitaire ou en batch.

## Installation (une seule fois)

```bash
npm install
```

Puis dépose ton **vrai logo** transparent ici : `assets/logo.png`
(remplace le placeholder). Les polices Mulish sont déjà incluses dans `assets/fonts/`.

## Workflow

1. Tu me demandes le prompt image + les textes → je te renvoie une **entrée JSON** à coller dans `articles.json`.
2. Tu génères l'image sur meta.ai et tu la déposes dans `input/` nommée par le **slug** :
   `input/<slug>.png` (ou .jpg / .jpeg / .webp — peu importe le ratio, c'est recadré en cover 1600×800).
3. Tu lances le build.

## Utilisation

```bash
node build.js                 # génère TOUTES les entrées de articles.json
node build.js mon-slug        # génère un seul article
node build.js slug-a slug-b   # génère une sélection
```

Résultat dans `output/<slug>.png`.

## articles.json

```json
[
  {
    "slug": "creer-boutique-en-ligne-rentable-cameroun-erreurs-a-eviter",
    "title": "9 boutiques en ligne sur 10 commettent la même erreur",
    "subtitle": "Les pièges à éviter pour vraiment vendre au Cameroun",
    "overlay": 0.78
  }
]
```

- `slug` : identifiant unique, sert à matcher l'image dans `input/` et à nommer la sortie.
- `title` : mis en MAJUSCULES automatiquement, auto-ajusté (rétréci jusqu'à tenir sur ≤ 3 lignes).
- `subtitle` : en italique, filets automatiques de chaque côté.
- `overlay` (optionnel) : opacité du wash crème, 0 → 1. Défaut `0.75`.
  Monte-le (0.85) si l'illustration doit s'effacer, baisse-le (0.6) pour la laisser ressortir.

## Réglages

Tout est dans l'objet `CONFIG` en haut de `build.js` : positions, tailles, couleurs,
marges, format de sortie (`png` ou `jpeg`). Rien d'autre à toucher.
