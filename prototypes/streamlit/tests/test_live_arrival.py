import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from presentation import live_arrival_summary


class LiveArrivalTests(unittest.TestCase):
    def setUp(self):
        self.first = {"tripId": "one", "alighting": {"id": "hub"}}
        self.last = {
            "tripId": "two",
            "alighting": {"id": "end"},
            "departsAt": 1_500_000,
        }
        self.journey = {
            "legs": [self.first, self.last],
            "finalWalkMinutes": 3,
            "connection": {"minimumSeconds": 300},
        }

    def test_final_arrival_adds_final_walk_only_to_verified_downstream_eta(self):
        result = live_arrival_summary(
            self.journey, self.last, {"arrivalAt": 1_000_000, "alightingAt": 2_000_000}
        )
        self.assertEqual(result["at"], 2_180_000)
        self.assertIn("estimated walk", result["label"])

    def test_missing_destination_prediction_never_invents_arrival(self):
        self.assertIsNone(
            live_arrival_summary(self.journey, self.last, {"arrivalAt": 1_000_000})
        )
        self.assertIsNone(
            live_arrival_summary(
                self.journey,
                self.last,
                {"arrivalAt": 1_000_000, "alightingAt": 900_000},
            )
        )

    def test_first_transfer_leg_does_not_claim_final_destination_time(self):
        result = live_arrival_summary(
            self.journey, self.first, {"alightingAt": 1_300_000}
        )
        self.assertEqual(result["at"], 1_300_000)
        self.assertIn("Transfer stop", result["label"])
        self.assertTrue(result["connectionRisk"])

    def test_exact_minimum_transfer_boundary_is_feasible(self):
        result = live_arrival_summary(
            self.journey, self.first, {"alightingAt": 1_200_000}
        )
        self.assertFalse(result["connectionRisk"])
