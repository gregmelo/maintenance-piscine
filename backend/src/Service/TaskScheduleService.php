<?php

namespace App\Service;

use App\Entity\MaintenanceTask;

final class TaskScheduleService
{
    public function isDue(MaintenanceTask $task, int $month): bool
    {
        $startMonth = $task->getStartMonth();
        $intervalMonths = $task->getIntervalMonths();

        return $intervalMonths <= 1
            || (($month - $startMonth) >= 0 && (($month - $startMonth) % $intervalMonths === 0));
    }
}