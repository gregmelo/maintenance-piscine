<?php

namespace App\DataFixtures;

use App\Entity\Category;
use App\Entity\MaintenanceTask;
use Doctrine\Bundle\FixturesBundle\Fixture;
use Doctrine\Persistence\ObjectManager;

class AppFixtures extends Fixture
{
    public function load(ObjectManager $manager): void
    {
        $data = [
            'Sécurité incendie' => [
                ['title' => "Vérifier l'état des extincteurs", 'freq' => 'Mensuel', 'interval' => 1],
                ['title' => "Contrôle des portes coupe-feu", 'freq' => 'Trimestriel', 'interval' => 3],
                ['title' => "Vérifier le fonctionnement des BAES", 'freq' => 'Mensuel', 'interval' => 1],
            ],
            'Électricité / Éclairage' => [
                ['title' => "Vérifier le bon fonctionnement des éclairages du site", 'freq' => 'Mensuel', 'interval' => 1],
                ['title' => "Contrôler le fonctionnement des sèche-cheveux", 'freq' => 'Mensuel', 'interval' => 1],
                ['title' => "Nettoyage complet des sèche-cheveux", 'freq' => 'Trimestriel', 'interval' => 3],
            ],
            'Sanitaires / Plomberie' => [
                ['title' => "Détartrer les pommeaux de douche", 'freq' => 'Mensuel', 'interval' => 1],
                ['title' => "Détartrer les douches et les robinets", 'freq' => 'Mensuel', 'interval' => 1],
                ['title' => "Détartrer les urinoirs et les siphons", 'freq' => 'Mensuel', 'interval' => 1],
                ['title' => "Détartrage des pierres de sauna", 'freq' => 'Trimestriel', 'interval' => 3],
            ],
            'Ventilation' => [
                ['title' => "Dépoussiérer les grilles de ventilation", 'freq' => 'Trimestriel', 'interval' => 3],
            ],
            'Équipements sportifs' => [
                ['title' => "Contrôler les ancrages des plongeoirs", 'freq' => 'Mensuel', 'interval' => 1],
            ],
            'Vestiaires / Casiers' => [
                ['title' => "Vérifier les serrures de casier", 'freq' => 'Trimestriel', 'interval' => 3],
            ],
        ];

        foreach ($data as $catName => $tasks) {
            $cat = new Category();
            $cat->setName($catName);
            $manager->persist($cat);

            foreach ($tasks as $t) {
                $task = new MaintenanceTask();
                $task->setCategory($cat);
                $task->setTitle($t['title']);
                $task->setFrequency($t['freq']);
                $task->setIntervalMonths($t['interval']);
                $task->setStartMonth(1);
                $manager->persist($task);
            }
        }

        $manager->flush();
    }
}