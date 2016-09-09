CREATE TABLE `larvitfiles_files` (
  `uuid` binary(16) NOT NULL,
  `slug` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `data` longblob NOT NULL,
  PRIMARY KEY (`uuid`),
  UNIQUE KEY `slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `larvitfiles_files_metadata` (
  `fileUuid` binary(16) NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `value` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  KEY `fileUuid` (`fileUuid`),
  CONSTRAINT `larvitfiles_files_metadata_ibfk_1` FOREIGN KEY (`fileUuid`) REFERENCES `larvitfiles_files` (`uuid`) ON DELETE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
