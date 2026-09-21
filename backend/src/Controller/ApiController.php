<?php

namespace App\Controller;

use App\Entity\MaintenanceTask;
use App\Entity\TaskLog;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api')]
class ApiController extends AbstractController
{
    public function __construct(
        #[Autowire('%env(APP_API_KEY)%')]
        private string $apiKey
    ) {}

    /**
     * Vérification de la clé d'API
     */
    private function isAuthorized(Request $request): bool
    {
        $providedKey = $request->headers->get('X-API-KEY');
        return $providedKey !== null && hash_equals($this->apiKey, $providedKey);
    }

    #[Route('/tasks', name: 'api_tasks_list', methods: ['GET'])]
    public function getTasks(EntityManagerInterface $em, Request $request): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $year = (int) $request->query->get('year', date('Y'));
        $month = (int) $request->query->get('month', date('n'));

        $tasks = $em->getRepository(MaintenanceTask::class)->findAll();
        $logs = $em->getRepository(TaskLog::class)->findBy(['year' => $year, 'month' => $month]);

        $logMap = [];
        foreach ($logs as $log) {
            $logMap[$log->getTask()->getId()] = $log;
        }

        $result = [];
        foreach ($tasks as $task) {
            $interval = $task->getIntervalMonths();
            $start = $task->getStartMonth();

            // Formule pour le modulo positif
            $isDue = ((($month - $start) % $interval) + $interval) % $interval === 0;

            $currentLog = $logMap[$task->getId()] ?? null;

            $result[] = [
                'id' => $task->getId(),
                'title' => $task->getTitle(),
                'category' => $task->getCategory()->getName(),
                'frequency' => $task->getFrequency(),
                'isDue' => $isDue,
                'status' => $currentLog ? $currentLog->getStatus() : 'A_FAIRE',
                'observation' => $currentLog ? $currentLog->getObservation() : '',
                'updatedBy' => $currentLog ? $currentLog->getUpdatedBy() : null,
                'updatedAt' => $currentLog ? $currentLog->getUpdatedAt()->format(\DateTimeInterface::ATOM) : null,
                'completedAt' => $currentLog?->getCompletedAt()?->format(\DateTimeInterface::ATOM),
                'photoUrl' => $currentLog?->getPhotoUrl(),
            ];
        }

        return $this->json($result);
    }

    #[Route('/tasks/sync', name: 'api_tasks_sync', methods: ['POST'])]
    public function syncTasks(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $data = json_decode($request->getContent(), true);
        if (!is_array($data)) {
            return $this->json(['error' => 'Données JSON invalides'], Response::HTTP_BAD_REQUEST);
        }

        $taskRepo = $em->getRepository(MaintenanceTask::class);
        $logRepo = $em->getRepository(TaskLog::class);

        foreach ($data as $item) {
            $taskId = $item['taskId'] ?? $item['id'] ?? null;
            if (!$taskId) continue;

            $task = $taskRepo->find($taskId);
            if (!$task) continue;

            $year = (int)$item['year'];
            $month = (int)$item['month'];

            $log = $logRepo->findOneBy(['task' => $task, 'year' => $year, 'month' => $month]);
            if (!$log) {
                $log = new TaskLog();
                $log->setTask($task);
                $log->setYear($year);
                $log->setMonth($month);
                $em->persist($log);
            }

            $log->setStatus($item['status']);
            $log->setObservation($item['observation'] ?? null);
            $log->setUpdatedAt(new \DateTimeImmutable());

            if (in_array($item['status'], ['FAIT', 'RESERVE'])) {
                $log->setUpdatedBy($item['updatedBy'] ?? 'Agent');
                if (!empty($item['completedAt'])) {
                    try {
                        $log->setCompletedAt(new \DateTimeImmutable($item['completedAt']));
                    } catch (\Exception) {
                        $log->setCompletedAt(new \DateTimeImmutable());
                    }
                } elseif ($log->getCompletedAt() === null) {
                    $log->setCompletedAt(new \DateTimeImmutable());
                }
            } else {
                $log->setUpdatedBy(null);
                $log->setCompletedAt(null);
            }

            // Gestion de la photo envoyée en base64 pour les réserves
            if (!empty($item['photoBase64'])) {
                $uploadDir = $this->getParameter('kernel.project_dir') . '/public/uploads/tasks';
                if (!is_dir($uploadDir)) {
                    mkdir($uploadDir, 0775, true);
                }

                if (preg_match('/^data:image\/(\w+);base64,/', $item['photoBase64'], $type)) {
                    $dataImg = substr($item['photoBase64'], strpos($item['photoBase64'], ',') + 1);
                    $dataImg = base64_decode($dataImg);

                    if ($dataImg !== false) {
                        $extension = strtolower($type[1]);
                        $filename = sprintf('task_%d_%d_%d_%s.%s', $task->getId(), $year, $month, uniqid(), $extension);
                        file_put_contents($uploadDir . '/' . $filename, $dataImg);
                        $log->setPhotoUrl('/uploads/tasks/' . $filename);
                    }
                }
            }
        }

        $em->flush();

        return $this->json(['status' => 'success', 'syncedCount' => count($data)]);
    }

    #[Route('/admin/reserves', name: 'api_admin_reserves', methods: ['GET'])]
    public function getAdminReserves(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $logRepo = $em->getRepository(TaskLog::class);
        $reserves = $logRepo->findBy(['status' => 'RESERVE'], ['year' => 'DESC', 'month' => 'DESC', 'updatedAt' => 'DESC']);

        $data = [];
        foreach ($reserves as $log) {
            $task = $log->getTask();
            $data[] = [
                'logId' => $log->getId(),
                'taskId' => $task->getId(),
                'taskTitle' => $task->getTitle(),
                'category' => $task->getCategory()?->getName(),
                'frequency' => $task->getFrequency(),
                'year' => $log->getYear(),
                'month' => $log->getMonth(),
                'observation' => $log->getObservation(),
                'updatedBy' => $log->getUpdatedBy(),
                'completedAt' => $log->getCompletedAt()?->format(\DateTimeInterface::ATOM),
                'photoUrl' => $log->getPhotoUrl(),
            ];
        }

        return $this->json($data);
    }

    #[Route('/admin/reserves/{id}/resolve', name: 'api_admin_resolve_reserve', methods: ['POST'])]
    public function resolveReserve(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $log = $em->getRepository(TaskLog::class)->find($id);
        if (!$log) {
            return $this->json(['error' => 'Enregistrement introuvable'], Response::HTTP_NOT_FOUND);
        }

        $body = json_decode($request->getContent(), true) ?? [];
        $deletePhoto = $body['deletePhoto'] ?? true;
        $resolutionNote = trim($body['resolutionNote'] ?? '');
        $adminUser = $body['user'] ?? 'Grégory';

        // 1. Suppression du fichier physique de la photo sur le disque si demandé
        if ($deletePhoto && $log->getPhotoUrl()) {
            $filePath = $this->getParameter('kernel.project_dir') . '/public' . $log->getPhotoUrl();
            if (file_exists($filePath)) {
                unlink($filePath);
            }
            $log->setPhotoUrl(null);
        }

        // 2. Mise à jour de l'observation
        if (!empty($resolutionNote)) {
            $initialNote = $log->getObservation() ? $log->getObservation() . " | " : "";
            $log->setObservation($initialNote . "[Résolu par " . $adminUser . " : " . $resolutionNote . "]");
        }

        // 3. Passage au statut FAIT (vert)
        $log->setStatus('FAIT');
        $log->setUpdatedBy($adminUser);
        $log->setCompletedAt(new \DateTimeImmutable());
        $log->setUpdatedAt(new \DateTimeImmutable());

        $em->flush();

        return $this->json(['status' => 'success', 'message' => 'Réserve levée avec succès']);
    }

   #[Route('/admin/tasks', name: 'api_admin_add_task', methods: ['POST'])]
    public function addTask(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $body = json_decode($request->getContent(), true);
        if (empty($body['title']) || empty($body['category'])) {
            return $this->json(['error' => 'Titre et catégorie obligatoires'], Response::HTTP_BAD_REQUEST);
        }

        // 1. Récupérer ou créer la catégorie
        $categoryRepo = $em->getRepository(\App\Entity\Category::class);
        $category = $categoryRepo->findOneBy(['name' => $body['category']]);
        if (!$category) {
            $category = new \App\Entity\Category();
            $category->setName($body['category']);
            $em->persist($category);
        }

        // 2. Déduire startMonth et intervalMonths selon la fréquence choisie
        $frequency = $body['frequency'] ?? 'Mensuel';
        $intervalMonths = 1;
        $startMonth = isset($body['startMonth']) ? (int)$body['startMonth'] : 1;

        if ($frequency === 'Trimestriel') {
            $intervalMonths = 3;
        } elseif ($frequency === 'Semestriel') {
            $intervalMonths = 6;
        } elseif ($frequency === 'Annuel') {
            $intervalMonths = 12;
        }

        // 3. Créer la tâche
        $task = new MaintenanceTask();
        $task->setTitle($body['title']);
        $task->setCategory($category);
        $task->setFrequency($frequency);
        $task->setStartMonth($startMonth);
        $task->setIntervalMonths($intervalMonths);

        $em->persist($task);
        $em->flush();

        return $this->json(['status' => 'success', 'taskId' => $task->getId()], Response::HTTP_CREATED);
    }

    #[Route('/admin/tasks/{id}', name: 'api_admin_delete_task', methods: ['DELETE'])]
    public function deleteTask(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $task = $em->getRepository(MaintenanceTask::class)->find($id);
        if (!$task) {
            return $this->json(['error' => 'Tâche introuvable'], Response::HTTP_NOT_FOUND);
        }

        // Supprimer d'abord les logs associés à cette tâche pour éviter les contraintes de clé étrangère
        $logRepo = $em->getRepository(TaskLog::class);
        $logs = $logRepo->findBy(['task' => $task]);
        foreach ($logs as $log) {
            if ($log->getPhotoUrl()) {
                $filePath = $this->getParameter('kernel.project_dir') . '/public' . $log->getPhotoUrl();
                if (file_exists($filePath)) {
                    unlink($filePath);
                }
            }
            $em->remove($log);
        }

        $em->remove($task);
        $em->flush();

        return $this->json(['status' => 'success', 'message' => 'Tâche supprimée avec succès']);
    }

    #[Route('/admin/summary', name: 'api_admin_summary', methods: ['GET'])]
    public function getAdminSummary(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $year = (int)$request->query->get('year', (int)date('Y'));

        $tasks = $em->getRepository(MaintenanceTask::class)->findAll();
        $logRepo = $em->getRepository(TaskLog::class);

        $summary = [];

        for ($month = 1; $month <= 12; $month++) {
            $dueCount = 0;
            $doneCount = 0;
            $reserveCount = 0;

            foreach ($tasks as $task) {
                // Vérifier si la tâche est due pour ce mois
                $start = $task->getStartMonth();
                $interval = $task->getIntervalMonths();
                $isDue = ($interval <= 1) || (($month - $start) >= 0 && (($month - $start) % $interval === 0));

                if (!$isDue) {
                    continue;
                }

                $dueCount++;

                $log = $logRepo->findOneBy(['task' => $task, 'year' => $year, 'month' => $month]);
                if ($log) {
                    if ($log->getStatus() === 'FAIT') {
                        $doneCount++;
                    } elseif ($log->getStatus() === 'RESERVE') {
                        $reserveCount++;
                    }
                }
            }

            $rate = $dueCount > 0 ? (int)round(($doneCount / $dueCount) * 100) : 0;

            $summary[] = [
                'month' => $month,
                'dueCount' => $dueCount,
                'doneCount' => $doneCount,
                'reserveCount' => $reserveCount,
                'todoCount' => max(0, $dueCount - $doneCount - $reserveCount),
                'rate' => $rate,
            ];
        }

        return $this->json([
            'year' => $year,
            'months' => $summary,
        ]);
    }

    #[Route('/admin/verify-pin', name: 'api_admin_verify_pin', methods: ['POST'])]
    public function verifyAdminPin(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $submittedPin = (string)($data['pin'] ?? '');

        // Vérifier dans la base SQLite via DBAL si une table app_config existe
        $conn = $em->getConnection();
        $conn->executeStatement("
            CREATE TABLE IF NOT EXISTS app_config (
                config_key VARCHAR(50) PRIMARY KEY,
                config_value VARCHAR(255) NOT NULL
            )
        ");

        $storedPin = $conn->fetchOne("SELECT config_value FROM app_config WHERE config_key = 'admin_pin'");
        if (!$storedPin) {
            // PIN par défaut si non initialisé
            $storedPin = '2026';
            $conn->executeStatement("INSERT INTO app_config (config_key, config_value) VALUES ('admin_pin', '2026')");
        }

        if ($submittedPin === (string)$storedPin) {
            // Génération d'un token de session éphémère simple
            $token = bin2hex(random_bytes(16));
            return $this->json(['valid' => true, 'token' => $token]);
        }

        return $this->json(['valid' => false, 'error' => 'Code PIN incorrect'], Response::HTTP_FORBIDDEN);
    }

    #[Route('/admin/update-pin', name: 'api_admin_update_pin', methods: ['POST'])]
    public function updateAdminPin(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $currentPin = (string)($data['currentPin'] ?? '');
        $newPin = trim((string)($data['newPin'] ?? ''));

        if (strlen($newPin) < 4) {
            return $this->json(['error' => 'Le code PIN doit comporter au moins 4 caractères'], Response::HTTP_BAD_REQUEST);
        }

        $conn = $em->getConnection();
        $storedPin = $conn->fetchOne("SELECT config_value FROM app_config WHERE config_key = 'admin_pin'");
        if (!$storedPin) {
            $storedPin = '2026';
        }

        if ($currentPin !== (string)$storedPin) {
            return $this->json(['error' => 'Code PIN actuel incorrect'], Response::HTTP_FORBIDDEN);
        }

        $conn->executeStatement("
            INSERT INTO app_config (config_key, config_value) 
            VALUES ('admin_pin', :val) 
            ON CONFLICT(config_key) DO UPDATE SET config_value = :val
        ", ['val' => $newPin]);

        return $this->json(['success' => true, 'message' => 'Code PIN mis à jour avec succès']);
    }

    #[Route('/admin/backup-db', name: 'api_admin_backup_db', methods: ['GET'])]
    public function backupDatabase(Request $request): Response
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $dbPath = $this->getParameter('kernel.project_dir') . '/var/data.db';

        if (!file_exists($dbPath)) {
            return $this->json(['error' => 'Fichier de base de données introuvable'], Response::HTTP_NOT_FOUND);
        }

        $dateStr = date('Y-m-d_H-i');
        $fileName = "backup_piscine_{$dateStr}.db";

        return $this->file($dbPath, $fileName, \Symfony\Component\HttpFoundation\ResponseHeaderBag::DISPOSITION_ATTACHMENT);
    }

    #[Route('/admin/tasks/{id}', name: 'api_admin_task_update', methods: ['PUT'])]
    public function updateTask(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $task = $em->getRepository(MaintenanceTask::class)->find($id);
        if (!$task) {
            return $this->json(['error' => 'Tâche introuvable'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $title = trim((string)($data['title'] ?? ''));
        $category = trim((string)($data['category'] ?? ''));
        $frequency = trim((string)($data['frequency'] ?? ''));
        $startMonth = (int)($data['startMonth'] ?? 1);

        if ($title === '') {
            return $this->json(['error' => 'Le libellé est obligatoire'], Response::HTTP_BAD_REQUEST);
        }

        $task->setTitle($title);
        if ($category !== '') $task->setCategory($category);
        if ($frequency !== '') $task->setFrequency($frequency);
        $task->setStartMonth(max(1, min(12, $startMonth)));

        $em->flush();

        return $this->json(['success' => true, 'message' => 'Tâche mise à jour']);
    }

    #[Route('/tasks/{id}/history', name: 'api_task_history', methods: ['GET'])]
    public function getTaskHistory(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $task = $em->getRepository(MaintenanceTask::class)->find($id);
        if (!$task) {
            return $this->json(['error' => 'Tâche introuvable'], Response::HTTP_NOT_FOUND);
        }

        $year = (int)$request->query->get('year', (int)date('Y'));
        $logs = $em->getRepository(TaskLog::class)->findBy(
            ['task' => $task, 'year' => $year],
            ['month' => 'ASC']
        );

        $logsByMonth = [];
        foreach ($logs as $log) {
            $logsByMonth[$log->getMonth()] = [
                'status' => $log->getStatus(),
                'observation' => $log->getObservation(),
                'updatedBy' => $log->getUpdatedBy(),
                'completedAt' => $log->getCompletedAt()?->format(\DateTimeInterface::ATOM),
                'photoUrl' => $log->getPhotoUrl(),
            ];
        }

        $history = [];
        for ($m = 1; $m <= 12; $m++) {
            $start = $task->getStartMonth();
            $interval = $task->getIntervalMonths();
            $isDue = ($interval <= 1) || (($m - $start) >= 0 && (($m - $start) % $interval === 0));

            $log = $logsByMonth[$m] ?? null;
            $history[] = [
                'month' => $m,
                'isDue' => $isDue,
                'status' => $log ? $log['status'] : ($isDue ? 'A_FAIRE' : 'NON_DU'),
                'observation' => $log['observation'] ?? null,
                'updatedBy' => $log['updatedBy'] ?? null,
                'completedAt' => $log['completedAt'] ?? null,
                'photoUrl' => $log['photoUrl'] ?? null,
            ];
        }

        return $this->json([
            'task' => [
                'id' => $task->getId(),
                'title' => $task->getTitle(),
                'category' => $task->getCategory(),
                'frequency' => $task->getFrequency(),
            ],
            'year' => $year,
            'history' => $history,
        ]);
    }
}