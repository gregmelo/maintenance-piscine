<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class MaintenanceTask
{
    // Une tache est un controle recurrent ; son journal mensuel est stocke dans TaskLog.
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne]
    #[ORM\JoinColumn(nullable: false)]
    private ?Category $category = null;

    #[ORM\Column(length: 255)]
    private ?string $title = null;

    #[ORM\Column(length: 50)]
    private ?string $frequency = null; // Mensuel, Trimestriel

    #[ORM\Column]
    private int $startMonth = 1;

    #[ORM\Column]
    private int $intervalMonths = 1; // 1 ou 3

    public function getId(): ?int { return $this->id; }
    public function getCategory(): ?Category { return $this->category; }
    public function setCategory(?Category $category): self { $this->category = $category; return $this; }
    public function getTitle(): ?string { return $this->title; }
    public function setTitle(string $title): self { $this->title = $title; return $this; }
    public function getFrequency(): ?string { return $this->frequency; }
    public function setFrequency(string $frequency): self { $this->frequency = $frequency; return $this; }
    public function getStartMonth(): int { return $this->startMonth; }
    public function setStartMonth(int $startMonth): self { $this->startMonth = $startMonth; return $this; }
    public function getIntervalMonths(): int { return $this->intervalMonths; }
    public function setIntervalMonths(int $intervalMonths): self { $this->intervalMonths = $intervalMonths; return $this; }
}