<?php

namespace App\Controller;

use App\Entity\Category;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\Request;

trait ApiControllerSupportTrait
{
    private function isAuthorized(Request $request): bool
    {
        $apiKey = $request->headers->get('X-API-KEY');
        $expectedKey = $_ENV['APP_API_KEY'] ?? 'piscine-amberieu-secret-key-2026';

        return $apiKey === $expectedKey;
    }

    private function getCategoryName(mixed $category): string
    {
        if (!$category) {
            return 'Général';
        }
        if (is_object($category)) {
            if (method_exists($category, 'getName')) {
                return (string) $category->getName();
            }
            if (method_exists($category, 'getTitle')) {
                return (string) $category->getTitle();
            }
            if (method_exists($category, '__toString')) {
                return (string) $category;
            }
        }

        return (string) $category;
    }

    private function findOrCreateCategory(string $categoryName, EntityManagerInterface $em): Category
    {
        $category = $em->getRepository(Category::class)->findOneBy(['name' => $categoryName]);

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
}