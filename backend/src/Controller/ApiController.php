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
}