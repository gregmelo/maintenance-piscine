<?php

namespace App;

use Symfony\Bundle\FrameworkBundle\Kernel\MicroKernelTrait;
use Symfony\Component\HttpKernel\Kernel as BaseKernel;

class Kernel extends BaseKernel
{
    // MicroKernelTrait permet a Symfony de charger la configuration depuis config/.
    use MicroKernelTrait;
}
