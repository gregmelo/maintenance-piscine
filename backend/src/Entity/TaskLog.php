<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'task_log', uniqueConstraints: [
    new ORM\UniqueConstraint(name: 'task_month_year_unique', columns: ['task_id', 'year', 'month'])
])]
class TaskLog
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?MaintenanceTask $task = null;

    #[ORM\Column]
    private int $year;

    #[ORM\Column]
    private int $month;

    #[ORM\Column(length: 20)]
    private string $status = 'A_FAIRE'; // FAIT, RESERVE, A_FAIRE

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $observation = null;

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $updatedBy = null;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct() {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getTask(): ?MaintenanceTask { return $this->task; }
    public function setTask(?MaintenanceTask $task): self { $this->task = $task; return $this; }
    public function getYear(): int { return $this->year; }
    public function setYear(int $year): self { $this->year = $year; return $this; }
    public function getMonth(): int { return $this->month; }
    public function setMonth(int $month): self { $this->month = $month; return $this; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $status): self { $this->status = $status; return $this; }
    public function getObservation(): ?string { return $this->observation; }
    public function setObservation(?string $observation): self { $this->observation = $observation; return $this; }
    public function getUpdatedBy(): ?string { return $this->updatedBy; }
    public function setUpdatedBy(?string $updatedBy): self { $this->updatedBy = $updatedBy; return $this; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function setUpdatedAt(\DateTimeImmutable $updatedAt): self { $this->updatedAt = $updatedAt; return $this; }
}