<?php

namespace App\Controller;

use App\Entity\MaintenanceTask;
use App\Entity\TaskLog;
use App\Service\TaskScheduleService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api', name: 'api_')]
class ApiController extends AbstractController
{
    use ApiControllerSupportTrait;

    public function __construct(private readonly TaskScheduleService $taskSchedule)
    {
    }

    #[Route('/tasks', name: 'tasks_list', methods: ['GET'])]
    public function getTasks(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $year = (int)$request->query->get('year', (int)date('Y'));
        $month = (int)$request->query->get('month', (int)date('n'));

        $tasks = $em->getRepository(MaintenanceTask::class)->findAll();
        $logRepo = $em->getRepository(TaskLog::class);

        $result = [];
        foreach ($tasks as $task) {
            // Une tache est due si sa periodicite tombe sur le mois consulte.
            $isDue = $this->taskSchedule->isDue($task, $month);

            $log = $logRepo->findOneBy([
                'task' => $task,
                'year' => $year,
                'month' => $month,
            ]);

            $result[] = [
                'id' => $task->getId(),
                'title' => $task->getTitle(),
                'category' => $this->getCategoryName($task->getCategory()),
                'frequency' => $task->getFrequency(),
                'startMonth' => $task->getStartMonth(),
                'isDue' => $isDue,
                'status' => $log ? $log->getStatus() : 'A_FAIRE',
                'updatedBy' => $log ? $log->getUpdatedBy() : null,
                'completedAt' => ($log && $log->getCompletedAt()) ? $log->getCompletedAt()->format('c') : null,
                'observation' => $log ? $log->getObservation() : '',
                'photoUrl' => $log ? $log->getPhotoUrl() : null,
            ];
        }

        return $this->json($result);
    }

    #[Route('/tasks/sync', name: 'tasks_sync', methods: ['POST'])]
    public function syncTasks(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $updates = $data['updates'] ?? [];

        $taskRepo = $em->getRepository(MaintenanceTask::class);
        $logRepo = $em->getRepository(TaskLog::class);
        $uploadDir = $this->getParameter('kernel.project_dir') . '/public/uploads/tasks';

        if (!is_dir($uploadDir)) {
            mkdir($uploadDir, 0777, true);
        }

        // Les changements hors ligne sont rejoues dans la meme transaction Doctrine.
        foreach ($updates as $item) {
            $task = $taskRepo->find((int)($item['taskId'] ?? 0));
            if (!$task) {
                continue;
            }

            $year = (int)($item['year'] ?? date('Y'));
            $month = (int)($item['month'] ?? date('n'));

            $log = $logRepo->findOneBy([
                'task' => $task,
                'year' => $year,
                'month' => $month,
            ]);

            if (!$log) {
                $log = new TaskLog();
                $log->setTask($task);
                $log->setYear($year);
                $log->setMonth($month);
                $em->persist($log);
            }

            $log->setStatus($item['status'] ?? 'A_FAIRE');
            $log->setObservation($item['observation'] ?? null);
            $log->setUpdatedBy($item['updatedBy'] ?? null);

            if (!empty($item['completedAt'])) {
                try {
                    $log->setCompletedAt(new \DateTimeImmutable($item['completedAt']));
                } catch (\Exception) {
                    $log->setCompletedAt(new \DateTimeImmutable());
                }
            } else {
                $log->setCompletedAt(null);
            }

            // L'image est materialisee sur le serveur et l'ancien fichier est supprime.
            if (!empty($item['photoBase64']) && str_starts_with($item['photoBase64'], 'data:image/')) {
                $parts = explode(',', $item['photoBase64']);
                if (count($parts) === 2) {
                    $decoded = base64_decode($parts[1]);
                    $fileName = 'task_' . $task->getId() . '_' . $year . '_' . $month . '_' . uniqid() . '.jpg';
                    $filePath = $uploadDir . '/' . $fileName;

                    if ($log->getPhotoUrl()) {
                        $oldFile = $this->getParameter('kernel.project_dir') . '/public' . $log->getPhotoUrl();
                        if (file_exists($oldFile)) {
                            @unlink($oldFile);
                        }
                    }

                    file_put_contents($filePath, $decoded);
                    $log->setPhotoUrl('/uploads/tasks/' . $fileName);
                }
            }
        }

        $em->flush();

        return $this->json(['success' => true, 'processed' => count($updates)]);
    }

    #[Route('/tasks/{id}/history', name: 'task_history', methods: ['GET'])]
    public function getTaskHistory(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $task = $em->getRepository(MaintenanceTask::class)->find($id);
        if (!$task) {
            return $this->json(['error' => 'Tâche introuvable'], Response::HTTP_NOT_FOUND);
        }

        $logs = $em->getRepository(TaskLog::class)->findBy(
            ['task' => $task],
            ['year' => 'DESC', 'month' => 'DESC']
        );

        $history = [];
        foreach ($logs as $log) {
            $history[] = [
                'logId' => $log->getId(),
                'year' => $log->getYear(),
                'month' => $log->getMonth(),
                'status' => $log->getStatus(),
                'observation' => $log->getObservation(),
                'updatedBy' => $log->getUpdatedBy(),
                'completedAt' => $log->getCompletedAt() ? $log->getCompletedAt()->format('c') : null,
                'photoUrl' => $log->getPhotoUrl(),
            ];
        }

        return $this->json([
            'task' => [
                'id' => $task->getId(),
                'title' => $task->getTitle(),
                'category' => $this->getCategoryName($task->getCategory()),
                'frequency' => $task->getFrequency(),
            ],
            'history' => $history,
        ]);
    }

    #[Route('/admin/verify-pin', name: 'admin_verify_pin', methods: ['POST'])]
    public function verifyAdminPin(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $submittedPin = (string)($data['pin'] ?? '');

        $conn = $em->getConnection();
        $conn->executeStatement("
            CREATE TABLE IF NOT EXISTS app_config (
                config_key VARCHAR(50) PRIMARY KEY,
                config_value VARCHAR(255) NOT NULL
            )
        ");

        $storedPin = $conn->fetchOne("SELECT config_value FROM app_config WHERE config_key = 'admin_pin'");
        if (!$storedPin) {
            $storedPin = '2026';
            $conn->executeStatement("INSERT INTO app_config (config_key, config_value) VALUES ('admin_pin', '2026')");
        }

        if ($submittedPin === (string)$storedPin) {
            $token = bin2hex(random_bytes(16));
            return $this->json(['valid' => true, 'token' => $token]);
        }

        return $this->json(['valid' => false, 'error' => 'Code PIN incorrect'], Response::HTTP_FORBIDDEN);
    }

    #[Route('/admin/update-pin', name: 'admin_update_pin', methods: ['POST'])]
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

    #[Route('/admin/summary', name: 'admin_summary', methods: ['GET'])]
    public function getAnnualSummary(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $year = (int)$request->query->get('year', (int)date('Y'));
        $tasks = $em->getRepository(MaintenanceTask::class)->findAll();
        $logRepo = $em->getRepository(TaskLog::class);

        $monthsSummary = [];

        // Le calcul reprend la meme regle d'echeance que la liste mensuelle.
        for ($m = 1; $m <= 12; $m++) {
            $dueCount = 0;
            $doneCount = 0;
            $reserveCount = 0;

            foreach ($tasks as $task) {
                $isDue = $this->taskSchedule->isDue($task, $m);

                if (!$isDue) continue;

                $dueCount++;

                $log = $logRepo->findOneBy([
                    'task' => $task,
                    'year' => $year,
                    'month' => $m,
                ]);

                if ($log) {
                    if ($log->getStatus() === 'FAIT') {
                        $doneCount++;
                    } elseif ($log->getStatus() === 'RESERVE') {
                        $reserveCount++;
                    }
                }
            }

            $todoCount = max(0, $dueCount - $doneCount - $reserveCount);
            $rate = $dueCount > 0 ? round(($doneCount / $dueCount) * 100) : 0;

            $monthsSummary[] = [
                'month' => $m,
                'dueCount' => $dueCount,
                'doneCount' => $doneCount,
                'reserveCount' => $reserveCount,
                'todoCount' => $todoCount,
                'rate' => $rate,
            ];
        }

        return $this->json([
            'year' => $year,
            'months' => $monthsSummary,
        ]);
    }

    #[Route('/admin/annual-report', name: 'admin_annual_report', methods: ['GET'])]
    public function getAnnualReport(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $year = (int)$request->query->get('year', (int)date('Y'));
        $tasks = $em->getRepository(MaintenanceTask::class)->findAll();
        $logRepo = $em->getRepository(TaskLog::class);

        $reportMonths = [];

        for ($m = 1; $m <= 12; $m++) {
            $monthTasks = [];

            foreach ($tasks as $task) {
                $isDue = $this->taskSchedule->isDue($task, $m);

                if (!$isDue) continue;

                $log = $logRepo->findOneBy(['task' => $task, 'year' => $year, 'month' => $m]);

                $monthTasks[] = [
                    'id' => $task->getId(),
                    'title' => $task->getTitle(),
                    'category' => $this->getCategoryName($task->getCategory()),
                    'frequency' => $task->getFrequency(),
                    'status' => $log ? $log->getStatus() : 'A_FAIRE',
                    'updatedBy' => $log ? $log->getUpdatedBy() : null,
                    'completedAt' => ($log && $log->getCompletedAt()) ? $log->getCompletedAt()->format('c') : null,
                    'observation' => $log ? $log->getObservation() : '',
                ];
            }

            $reportMonths[] = [
                'month' => $m,
                'tasks' => $monthTasks,
            ];
        }

        return $this->json([
            'year' => $year,
            'months' => $reportMonths,
        ]);
    }

    #[Route('/admin/reserves', name: 'admin_reserves_list', methods: ['GET'])]
    public function getActiveReserves(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $reserves = $em->getRepository(TaskLog::class)->findBy(
            ['status' => 'RESERVE'],
            ['year' => 'DESC', 'month' => 'DESC']
        );

        $result = [];
        foreach ($reserves as $log) {
            $task = $log->getTask();
            $result[] = [
                'logId' => $log->getId(),
                'taskId' => $task ? $task->getId() : null,
                'taskTitle' => $task ? $task->getTitle() : 'Inconnue',
                'category' => $task ? $this->getCategoryName($task->getCategory()) : 'Non classé',
                'year' => $log->getYear(),
                'month' => $log->getMonth(),
                'observation' => $log->getObservation(),
                'updatedBy' => $log->getUpdatedBy(),
                'completedAt' => $log->getCompletedAt() ? $log->getCompletedAt()->format('c') : null,
                'photoUrl' => $log->getPhotoUrl(),
            ];
        }

        return $this->json($result);
    }

    #[Route('/admin/reserves/{id}/resolve', name: 'admin_resolve_reserve', methods: ['POST'])]
    public function resolveReserve(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $log = $em->getRepository(TaskLog::class)->find($id);
        if (!$log) {
            return $this->json(['error' => 'Log introuvable'], Response::HTTP_NOT_FOUND);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $deletePhoto = $data['deletePhoto'] ?? false;
        $resolutionNote = trim($data['resolutionNote'] ?? '');
        $user = $data['user'] ?? 'Responsable';

        if ($deletePhoto && $log->getPhotoUrl()) {
            $filePath = $this->getParameter('kernel.project_dir') . '/public' . $log->getPhotoUrl();
            if (file_exists($filePath)) {
                @unlink($filePath);
            }
            $log->setPhotoUrl(null);
        }

        // La resolution conserve la trace de l'anomalie dans l'observation du journal.
        $log->setStatus('FAIT');
        $log->setUpdatedBy($user);
        $log->setCompletedAt(new \DateTimeImmutable());

        if ($resolutionNote !== '') {
            $existing = $log->getObservation() ? $log->getObservation() . ' | ' : '';
            $log->setObservation($existing . '[Résolu : ' . $resolutionNote . ']');
        }

        $em->flush();

        return $this->json(['success' => true]);
    }

    #[Route('/admin/tasks', name: 'admin_task_add', methods: ['POST'])]
    public function addTask(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $data = json_decode($request->getContent(), true) ?? [];
        $title = trim($data['title'] ?? '');
        $categoryName = trim($data['category'] ?? 'Sécurité Incendie');
        $frequency = trim($data['frequency'] ?? 'Mensuel');
        $startMonth = (int)($data['startMonth'] ?? 1);

        if ($title === '') {
            return $this->json(['error' => 'Le titre est obligatoire'], Response::HTTP_BAD_REQUEST);
        }

        $category = $this->findOrCreateCategory($categoryName, $em);

        $task = new MaintenanceTask();
        $task->setTitle($title);
        $task->setCategory($category);
        $task->setFrequency($frequency);
        $task->setStartMonth($startMonth);

        $em->persist($task);
        $em->flush();

        return $this->json(['success' => true, 'id' => $task->getId()]);
    }

    #[Route('/admin/tasks/{id}', name: 'admin_task_update', methods: ['PUT'])]
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
        if (isset($data['title']) && trim($data['title']) !== '') {
            $task->setTitle(trim($data['title']));
        }
        if (isset($data['category']) && trim($data['category']) !== '') {
            $category = $this->findOrCreateCategory(trim($data['category']), $em);
            $task->setCategory($category);
        }
        if (isset($data['frequency'])) {
            $task->setFrequency($data['frequency']);
        }
        if (isset($data['startMonth'])) {
            $task->setStartMonth((int)$data['startMonth']);
        }

        $em->flush();

        return $this->json(['success' => true, 'message' => 'Tâche mise à jour']);
    }

    #[Route('/admin/tasks/{id}', name: 'admin_task_delete', methods: ['DELETE'])]
    public function deleteTask(int $id, Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $task = $em->getRepository(MaintenanceTask::class)->find($id);
        if (!$task) {
            return $this->json(['error' => 'Tâche introuvable'], Response::HTTP_NOT_FOUND);
        }

        $logs = $em->getRepository(TaskLog::class)->findBy(['task' => $task]);
        foreach ($logs as $log) {
            if ($log->getPhotoUrl()) {
                $filePath = $this->getParameter('kernel.project_dir') . '/public' . $log->getPhotoUrl();
                if (file_exists($filePath)) {
                    @unlink($filePath);
                }
            }
            $em->remove($log);
        }

        $em->remove($task);
        $em->flush();

        return $this->json(['success' => true]);
    }

    #[Route('/admin/cleanup-photos', name: 'admin_cleanup_photos', methods: ['POST'])]
    public function cleanupOrphanPhotos(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $uploadDir = $this->getParameter('kernel.project_dir') . '/public/uploads/tasks';
        if (!is_dir($uploadDir)) {
            return $this->json(['deletedCount' => 0, 'freedSpace' => 0]);
        }

        $logs = $em->getRepository(TaskLog::class)->findAll();
        $usedPhotos = [];
        foreach ($logs as $l) {
            if ($l->getPhotoUrl()) {
                $usedPhotos[] = basename($l->getPhotoUrl());
            }
        }

        $files = scandir($uploadDir);
        $deletedCount = 0;
        $freedBytes = 0;

        foreach ($files as $file) {
            if ($file === '.' || $file === '..') {
                continue;
            }
            if (!in_array($file, $usedPhotos, true)) {
                $filePath = $uploadDir . '/' . $file;
                if (is_file($filePath)) {
                    $freedBytes += filesize($filePath);
                    @unlink($filePath);
                    $deletedCount++;
                }
            }
        }

        $freedKb = round($freedBytes / 1024, 1);

        return $this->json([
            'success' => true,
            'deletedCount' => $deletedCount,
            'freedKb' => $freedKb,
        ]);
    }

    #[Route('/admin/backup-db', name: 'admin_backup_db', methods: ['GET'])]
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

    #[Route('/plan-pins', name: 'plan_pins_get', methods: ['GET'])]
    public function getPlanPins(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $conn = $em->getConnection();
        $conn->executeStatement("
            CREATE TABLE IF NOT EXISTS plan_pins (
                id VARCHAR(50) PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                title VARCHAR(255) NOT NULL,
                x FLOAT NOT NULL,
                y FLOAT NOT NULL
            )
        ");

        $pins = $conn->fetchAllAssociative("SELECT * FROM plan_pins");
        
        // Si la table est encore vide, on injecte les points de départ par défaut
        if (empty($pins)) {
            $defaults = [
                ['ext_1', 'extincteur', 'Extincteur n°1 — Hall Accueil', 63.5, 36.8],
                ['ext_2', 'extincteur', 'Extincteur n°2 — Dégagement Vestiaires', 54.2, 45.1],
                ['ext_3', 'extincteur', 'Extincteur n°3 — Local Chaufferie', 82.5, 81.2],
                ['baes_1', 'baes', 'BAES Sortie Principale Hall', 61.2, 32.1],
                ['des_1', 'desenfumage', 'Désenfumage — Circulation Vestiaires', 69.8, 33.5],
                ['coup_1', 'coupure', 'Coupure Gaz Chaufferie', 82.0, 85.0],
            ];
            foreach ($defaults as $d) {
                $conn->executeStatement(
                    "INSERT INTO plan_pins (id, type, title, x, y) VALUES (?, ?, ?, ?, ?)",
                    $d
                );
            }
            $pins = $conn->fetchAllAssociative("SELECT * FROM plan_pins");
        }

        return $this->json($pins);
    }

    #[Route('/plan-pins', name: 'plan_pins_save', methods: ['POST'])]
    public function savePlanPins(Request $request, EntityManagerInterface $em): JsonResponse
    {
        if (!$this->isAuthorized($request)) {
            return $this->json(['error' => 'Accès non autorisé'], Response::HTTP_UNAUTHORIZED);
        }

        $pins = json_decode($request->getContent(), true) ?? [];
        $conn = $em->getConnection();

        $conn->executeStatement("DELETE FROM plan_pins");

        foreach ($pins as $p) {
            $conn->executeStatement(
                "INSERT INTO plan_pins (id, type, title, x, y) VALUES (:id, :type, :title, :x, :y)",
                [
                    'id' => $p['id'],
                    'type' => $p['type'],
                    'title' => $p['title'],
                    'x' => (float)$p['x'],
                    'y' => (float)$p['y'],
                ]
            );
        }

        return $this->json(['success' => true, 'count' => count($pins)]);
    }
}