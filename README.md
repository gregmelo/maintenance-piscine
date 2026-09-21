# Maintenance Piscine d'Ambérieu

Application web progressive (PWA) destinée au suivi de la maintenance préventive d'un centre nautique.

L'application permet de consulter les opérations prévues pour un mois donné, de marquer chaque tâche comme à faire, faite ou réservée, d'ajouter une observation et de continuer à travailler lorsque la connexion au backend est indisponible. Les changements effectués hors ligne sont placés dans une file locale puis synchronisés automatiquement au retour du réseau.

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Prérequis](#prérequis)
- [Installation](#installation)
- [Configuration](#configuration)
- [Démarrage](#démarrage)
- [Utilisation](#utilisation)
- [API](#api)
- [Modèle de données](#modèle-de-données)
- [Règles de planification](#règles-de-planification)
- [Mode hors ligne et synchronisation](#mode-hors-ligne-et-synchronisation)
- [Tests et qualité](#tests-et-qualité)
- [Déploiement](#déploiement)
- [Dépannage](#dépannage)
- [Structure du projet](#structure-du-projet)

## Fonctionnalités

- Tableau de bord mensuel des tâches de maintenance.
- Navigation entre les mois.
- Regroupement des tâches par catégorie.
- Mise en évidence des tâches dues pour le mois sélectionné.
- Statistiques de suivi : tâches dues, tâches réalisées et tâches réservées.
- États disponibles : `A_FAIRE`, `FAIT` et `RESERVE`.
- Ajout et modification d'une observation par tâche.
- Ajout d'une photo compressée pour documenter une tâche ou une réserve.
- Identification de l'utilisateur ayant effectué la dernière modification.
- Historique mensuel d'une tâche.
- Espace administrateur protégé par PIN : réserves, tâches, synthèse annuelle et sauvegarde.
- Exports mensuels Excel/PDF et rapport annuel PDF.
- Fonctionnement hors ligne grâce à IndexedDB et Dexie.
- Synchronisation automatique de la file locale dès que le navigateur revient en ligne.
- Installation possible comme application grâce au support PWA.
- API Symfony protégée par une clé envoyée dans l'en-tête `X-API-KEY`.

## Architecture

Le projet est organisé en deux applications indépendantes :

```text
maintenance-piscine/
├── backend/                 # API Symfony 7.4 et persistance Doctrine
│   ├── config/              # Configuration Symfony, Doctrine et CORS
│   ├── migrations/          # Migrations Doctrine
│   ├── src/
│   │   ├── Controller/      # Endpoints HTTP
│   │   ├── DataFixtures/    # Données initiales de maintenance
│   │   └── Entity/          # Category, MaintenanceTask, TaskLog
│   └── var/                 # Cache, logs et base SQLite locale
├── frontend/                # Interface React + Vite
│   ├── public/              # Ressources statiques et icônes PWA
│   └── src/
│       ├── App.jsx          # Interface et interactions principales
│       ├── db.js            # Base IndexedDB locale
│       └── syncService.js   # Lecture API, file hors ligne et synchronisation
└── README.md
```

### Technologies

**Frontend**

- React 19
- Vite 8
- Dexie 4 pour IndexedDB
- `lucide-react` pour les icônes
- `vite-plugin-pwa` pour le manifeste et la mise à jour PWA

**Backend**

- Symfony 7.4
- Doctrine ORM 3.7
- SQLite par défaut en développement
- PHPUnit 11 pour les tests
- Nelmio CORS pour autoriser le frontend local

## Prérequis

Installer les outils suivants :
- Composer.
- Node.js et npm.
- Un navigateur récent prenant en charge Fetch, IndexedDB et les service workers.

Vérifier l'environnement :

```bash
php --version
composer --version
node --version
npm --version
```

## Installation

### 1. Installer le backend

Depuis la racine du dépôt :

```bash
cd backend
composer install
```

Le fichier `backend/.env` utilise SQLite par défaut et crée la base dans `backend/var/data.db`.

Créer la base et appliquer les migrations :

```bash
php bin/console doctrine:database:create --if-not-exists
php bin/console doctrine:migrations:migrate --no-interaction
```

Charger les catégories et les tâches initiales :

```bash
php bin/console doctrine:fixtures:load --no-interaction
```

> Attention : le chargement des fixtures peut supprimer les données existantes selon la configuration Doctrine utilisée. Ne l'exécutez pas sur une base de production sans sauvegarde.

### 2. Installer le frontend

Dans un autre terminal :

```bash
cd frontend
npm install
```

Créer `frontend/.env.local` si les valeurs par défaut ne conviennent pas :

```dotenv
VITE_API_URL=http://127.0.0.1:8000/api
VITE_API_KEY=remplacer-par-la-meme-cle-que-le-backend
```

Les variables `VITE_*` sont intégrées au bundle frontend. Elles ne doivent donc jamais contenir un secret qui doit rester confidentiel. La clé API doit être considérée comme un mécanisme d'accès partagé, pas comme une authentification forte par utilisateur.

## Configuration

### Backend

| Variable | Rôle | Exemple |
| --- | --- | --- |
| `APP_ENV` | Environnement Symfony | `dev` |
| `APP_SECRET` | Secret interne Symfony | valeur aléatoire |
| `DATABASE_URL` | Connexion Doctrine | `sqlite:///%kernel.project_dir%/var/data.db` |
| `APP_API_KEY` | Clé attendue par l'API | valeur aléatoire partagée |
| `CORS_ALLOW_ORIGIN` | Origines autorisées par CORS | `^https?://(localhost|127\\.0\\.0\\.1)(:[0-9]+)?$` |

Pour un environnement réel, définir ces valeurs dans l'environnement d'exécution ou dans un fichier `.env.local` non commité. La clé présente dans un environnement de développement ne doit pas être réutilisée en production.

### Frontend

| Variable | Rôle | Valeur par défaut |
| --- | --- | --- |
| `VITE_API_URL` | URL de base de l'API | `http://127.0.0.1:8000/api` |
| `VITE_API_KEY` | Clé envoyée dans `X-API-KEY` | vide |

La clé saisie dans le panneau **Profil & Clé d'API** est conservée dans `localStorage` sous la clé `pool_api_key`. Le nom de l'utilisateur est conservé sous `pool_user`.

## Démarrage

### Lancer l'API Symfony

Avec la Symfony CLI :

```bash
cd backend
symfony server:start
```

Ou avec le serveur PHP intégré :

```bash
cd backend
php -S 127.0.0.1:8000 -t public
```

L'API sera disponible à l'adresse `http://127.0.0.1:8000`.

### Lancer le frontend Vite

Dans un second terminal :

```bash
cd frontend
npm run dev
```

Vite affiche l'URL locale, généralement `http://localhost:5173`.

### Vérifier rapidement la connexion

Une requête valide doit contenir la même clé que `APP_API_KEY` :

```bash
curl -H "X-API-KEY: remplacer-par-la-cle" "http://127.0.0.1:8000/api/tasks?year=2026&month=9"
```

Une clé absente ou incorrecte retourne une réponse HTTP `401`.

## Utilisation

1. Ouvrir l'URL du frontend.
2. Renseigner le nom de l'utilisateur et la clé API dans les paramètres si elle n'est pas fournie par `VITE_API_KEY`.
3. Sélectionner le mois à consulter.
4. Développer ou réduire les catégories selon le besoin.
5. Modifier l'état d'une tâche et enregistrer une observation.
6. Vérifier l'indicateur de connexion avant de quitter la page.

Une tâche non due reste visible dans sa catégorie, mais les indicateurs et le tri mettent les tâches dues en priorité.

## API

Toutes les routes sont préfixées par `/api` et nécessitent l'en-tête suivant :

```http
X-API-KEY: <APP_API_KEY>
```

### Lister les tâches

```http
GET /api/tasks?year=2026&month=9
```

Paramètres de requête :

| Paramètre | Type | Défaut | Description |
| --- | --- | --- | --- |
| `year` | entier | année courante | Année du journal à charger |
| `month` | entier | mois courant | Mois du journal à charger, de 1 à 12 |

Réponse `200` :

```json
[
	{
		"id": 1,
		"title": "Vérifier l'état des extincteurs",
		"category": "Sécurité incendie",
		"frequency": "Mensuel",
		"isDue": true,
		"status": "A_FAIRE",
		"observation": "",
		"updatedBy": null,
		"updatedAt": null
	}
]
```

Réponse `401` :

```json
{"error":"Accès non autorisé"}
```

### Synchroniser des mises à jour

```http
POST /api/tasks/sync
Content-Type: application/json
X-API-KEY: <APP_API_KEY>
```

Le backend attend un objet contenant la liste `updates` :

```json
{
	"updates": [
		{
			"taskId": 1,
			"year": 2026,
			"month": 9,
			"status": "FAIT",
			"observation": "Contrôle effectué sans anomalie.",
			"updatedBy": "Grégory",
			"completedAt": "2026-09-21T10:30:00+00:00",
			"photoBase64": null,
			"timestamp": 1760000000000
		}
	]
}
```

Réponse `200` :

```json
{"success":true,"processed":1}
```

Le backend crée ou met à jour un journal unique pour le couple tâche/année/mois. Les identifiants de tâches inexistants sont ignorés. Une image `data:image/...;base64,...` est enregistrée dans `backend/public/uploads/tasks/`.

Le service frontend envoie actuellement la file sous forme de tableau JSON alors que le contrôleur backend lit le champ `updates`. Cette différence doit être harmonisée avant de dépendre de la synchronisation hors ligne en production.

### Routes administrateur

Les routes suivantes nécessitent la même clé API. La vérification du PIN est effectuée par `POST /api/admin/verify-pin`.

| Méthode | Route | Rôle |
| --- | --- | --- |
| `POST` | `/api/admin/verify-pin` | Vérifier le PIN administrateur |
| `POST` | `/api/admin/update-pin` | Modifier le PIN |
| `GET` | `/api/admin/summary?year=2026` | Obtenir la synthèse annuelle |
| `GET` | `/api/admin/annual-report?year=2026` | Obtenir les données du rapport annuel |
| `GET` | `/api/admin/reserves` | Lister les réserves actives |
| `POST` | `/api/admin/reserves/{id}/resolve` | Résoudre une réserve |
| `POST` | `/api/admin/tasks` | Ajouter une tâche |
| `PUT` | `/api/admin/tasks/{id}` | Modifier une tâche |
| `DELETE` | `/api/admin/tasks/{id}` | Supprimer une tâche et son historique |
| `POST` | `/api/admin/cleanup-photos` | Supprimer les photos orphelines |
| `GET` | `/api/admin/backup-db` | Télécharger une sauvegarde de la base |

L'authentification par PIN est conservée dans `sessionStorage` côté navigateur. Elle complète la clé API mais ne remplace pas une authentification serveur robuste pour un environnement exposé.

## Modèle de données

### `Category`

Une catégorie regroupe des tâches de maintenance. Exemples : sécurité incendie, électricité, sanitaires, ventilation.

### `MaintenanceTask`

Une tâche contient :

- `title` : intitulé de l'opération ;
- `category` : catégorie associée ;
- `frequency` : libellé affiché, par exemple `Mensuel` ou `Trimestriel` ;
- `startMonth` : premier mois du cycle ;
- `intervalMonths` : intervalle du cycle en mois.

### `TaskLog`

Un journal contient l'état d'une tâche pour un mois donné :

- `task` ;
- `year` et `month` ;
- `status` ;
- `observation` ;
- `updatedBy` ;
- `updatedAt` ;
- `completedAt` ;
- `photoUrl` : chemin de la photo associée, le cas échéant.

Une contrainte d'unicité empêche d'avoir plusieurs journaux pour la même tâche, la même année et le même mois.

## Règles de planification

Une tâche est due lorsque le mois sélectionné respecte son cycle :

```text
((mois - startMonth) modulo intervalMonths) == 0
```

Avec les fixtures actuelles :

- une tâche mensuelle (`intervalMonths = 1`) est due tous les mois ;
- une tâche trimestrielle (`intervalMonths = 3`) est due en janvier, avril, juillet et octobre lorsque `startMonth = 1` ;
- une tâche n'est pas due avant son `startMonth` dans l'année consultée.

Pour ajouter une tâche, modifier `backend/src/DataFixtures/AppFixtures.php`, puis recharger les fixtures dans une base de développement.

## Mode hors ligne et synchronisation

Le frontend utilise la base IndexedDB `PiscineMaintenanceDB`, gérée par Dexie :

- `tasksCache` conserve la dernière liste de tâches connue ;
- `syncQueue` conserve les changements qui n'ont pas encore été envoyés.

Lors d'une modification :

1. l'interface est mise à jour immédiatement ;
2. la tâche est modifiée dans le cache local ;
3. une entrée est ajoutée à `syncQueue` ;
4. `triggerSync()` tente d'envoyer les entrées au backend si le navigateur est en ligne ;
5. la file est vidée uniquement après une réponse HTTP réussie.

Lors d'une perte de réseau, l'application charge le dernier cache disponible. Lors du retour en ligne, un événement navigateur relance la synchronisation.

À noter : le cache et la file sont propres au navigateur et à son origine. Effacer les données du site peut supprimer les modifications locales encore non synchronisées.

## Tests et qualité

### Frontend

```bash
cd frontend
npm run lint
npm run build
```

Prévisualiser le build de production :

```bash
npm run preview
```

### Backend

```bash
cd backend
php bin/phpunit
```

Commandes Symfony utiles :

```bash
php bin/console debug:router
php bin/console doctrine:schema:validate
php bin/console cache:clear
```

## Déploiement

### Frontend sur GitHub Pages

Le fichier `frontend/vite.config.js` utilise `base: './'`, ce qui permet au bundle d'être servi depuis un sous-chemin. Les scripts prévus sont :

```bash
cd frontend
npm run build
npm run deploy
```

Avant le build, définir `VITE_API_URL` vers l'API accessible depuis Internet et `VITE_API_KEY` si cette stratégie d'accès est conservée.

Le backend doit être déployé séparément sur un serveur PHP/Symfony. Il doit autoriser l'origine publique du frontend via `CORS_ALLOW_ORIGIN`, utiliser une base persistante et disposer d'une clé `APP_API_KEY` distincte de celle du développement.

### Recommandations de production

- Utiliser HTTPS pour le frontend et l'API.
- Ne pas exposer une clé API permanente dans un dépôt public.
- Générer une clé longue et aléatoire.
- Restreindre `CORS_ALLOW_ORIGIN` au domaine réel du frontend.
- Sauvegarder la base de données.
- Configurer `APP_ENV=prod` et vider le cache après déploiement.
- Surveiller les logs Symfony dans `backend/var/log/`.

## Dépannage

### L'interface affiche « Accès non autorisé »

Vérifier que :

- `APP_API_KEY` est défini côté backend ;
- `VITE_API_KEY` ou la clé du panneau de paramètres correspond exactement ;
- l'en-tête `X-API-KEY` n'est pas supprimé par un proxy ;
- le frontend a été redémarré après modification d'une variable `VITE_*`.

### Le frontend ne joint pas l'API

Vérifier `VITE_API_URL`, que Symfony écoute bien sur le port attendu et que l'origine du frontend est autorisée par `CORS_ALLOW_ORIGIN`.

### Les données semblent anciennes

Le frontend peut afficher le cache IndexedDB lorsque l'API est temporairement inaccessible. Revenir en ligne, attendre la synchronisation, puis recharger la page. Ne pas effacer les données du site avant d'avoir confirmé que la file est synchronisée.

### La base SQLite n'existe pas

Depuis `backend/` :

```bash
php bin/console doctrine:database:create --if-not-exists
php bin/console doctrine:migrations:migrate --no-interaction
```

### Les tâches initiales manquent

Charger les fixtures dans une base de développement :

```bash
php bin/console doctrine:fixtures:load --no-interaction
```

## Structure du projet

| Chemin | Responsabilité |
| --- | --- |
| `frontend/src/App.jsx` | État de l'interface, navigation mensuelle, catégories et actions utilisateur |
| `frontend/src/syncService.js` | Appels API, lecture du cache, ajout et envoi de la file de synchronisation |
| `frontend/src/db.js` | Schéma IndexedDB Dexie |
| `frontend/vite.config.js` | Build Vite et configuration PWA |
| `backend/src/Controller/ApiController.php` | Authentification API, tâches, administration et synchronisation |
| `backend/public/uploads/tasks/` | Photos associées aux journaux de maintenance |
| `backend/src/Entity/` | Entités Doctrine |
| `backend/src/DataFixtures/AppFixtures.php` | Catégories et tâches initiales |
| `backend/config/packages/doctrine.yaml` | Connexion et mapping Doctrine |
| `backend/migrations/` | Évolutions du schéma de base |
| `backend/tests/` | Tests PHPUnit |

## Licence

Le projet est déclaré `proprietary` dans `backend/composer.json`. Les conditions d'utilisation, de redistribution et de déploiement doivent être définies par les propriétaires du projet.
