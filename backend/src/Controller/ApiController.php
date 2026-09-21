<?php

namespace App\Controller;

use App\Entity\Category;
use App\Entity\MaintenanceTask;
use App\Entity\TaskLog;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Annotation\Route;

#[Route('/api', name: 'api_')]
class ApiController extends AbstractController
{
    private function isAuthorized(Request $request): bool
    {
        $apiKey = $request->headers->get('X-API-KEY');
        $expectedKey = $_ENV['APP_API_KEY'] ?? 'piscine-amberieu-secret-key-2026';

        return $apiKey === $expectedKey;
    }

    /**
     * Helper pour extraire le nom textuel d'une catégorie qu'elle soit entité ou string
     */
    private function getCategoryName(mixed $category): string
    {
        if (!$category) {
            return 'Général';
        }
        if (is_object($category)) {
            if (method_exists($category, 'getName')) {
                return (string)$category->getName();
            }
            if (method_exists($category, 'getTitle')) {
                return (string)$category->getTitle();
            }
            if (method_exists($category, '__toString')) {
                return (string)$category;
            }
        }
        return (string)$category;
    }

    /**
     * Helper pour trouver ou créer l'entité Category
     */
    private function findOrCreateCategory(string $categoryName, EntityManagerInterface $em): Category
    {
        $catRepo = $em->getRepository(Category::class);
        $category = $catRepo->findOneBy(['name' => $categoryName]);

        if (!$category) {
            $category = new Category();
            if (method_exists($category, 'setName')) {
                $category->setName($categoryName);
            } elseif (method_exists($category, 'setTitle')) {
                $category->setTitle($categoryName);
            }
            $em->persist($category);
        }

        return $category;
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
            $start = $task->getStartMonth();
            $interval = $task->getIntervalMonths();
            $isDue = ($interval <= 1) || (($month - $start) >= 0 && (($month - $start) % $interval === 0));

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

            // Traitement de l'image base64
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

        for ($m = 1; $m <= 12; $m++) {
            $dueCount = 0;
            $doneCount = 0;
            $reserveCount = 0;

            foreach ($tasks as $task) {
                $start = $task->getStartMonth();
                $interval = $task->getIntervalMonths();
                $isDue = ($interval <= 1) || (($m - $start) >= 0 && (($m - $start) % $interval === 0));

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
                $start = $task->getStartMonth();
                $interval = $task->getIntervalMonths();
                $isDue = ($interval <= 1) || (($m - $start) >= 0 && (($m - $start) % $interval === 0));

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
}