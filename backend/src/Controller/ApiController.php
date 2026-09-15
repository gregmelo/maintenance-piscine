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
        }

        $em->flush();

        return $this->json(['status' => 'success', 'syncedCount' => count($data)]);
    }
}