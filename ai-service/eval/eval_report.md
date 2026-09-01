# Anomaly Detection Pipeline Evaluation Report

- **Total Test Cases**: 23
- **Accuracy**: **100.0%** (23/23)
- **Resolved by Rule-Based Check (Node 1)**: 17 (73.9%)
- **Resolved by LLM Reasoning (Node 2)**: 6 (26.1%)

## Detailed Test Results

| ID        | Employee       | Dist    | Dur    | Speed       | Expected   | Predicted   | Match   | Node          |   Conf |
|-----------|----------------|---------|--------|-------------|------------|-------------|---------|---------------|--------|
| NORM_01   | Ramesh Verma   | 15.0 km | 45.0 m | 20.0 km/h   | NORMAL     | NORMAL      | PASS    | rule_based    |   0.99 |
| NORM_02   | Suresh Nair    | 40.0 km | 90.0 m | 26.67 km/h  | NORMAL     | NORMAL      | PASS    | rule_based    |   0.99 |
| NORM_03   | Ananya Roy     | 8.0 km  | 30.0 m | 16.0 km/h   | NORMAL     | NORMAL      | PASS    | rule_based    |   0.99 |
| NORM_04   | Deepak Joshi   | 35.0 km | 60.0 m | 35.0 km/h   | NORMAL     | NORMAL      | PASS    | rule_based    |   0.99 |
| NORM_05   | Pooja Hegde    | 22.0 km | 45.0 m | 29.33 km/h  | NORMAL     | NORMAL      | PASS    | rule_based    |   0.99 |
| NORM_06   | Karthik Raja   | 50.0 km | 75.0 m | 40.0 km/h   | NORMAL     | NORMAL      | PASS    | rule_based    |   0.99 |
| NORM_07   | Manoj Tiwari   | 18.0 km | 40.0 m | 27.0 km/h   | NORMAL     | NORMAL      | PASS    | rule_based    |   0.99 |
| NORM_08   | Sunita Rao     | 5.5 km  | 20.0 m | 16.5 km/h   | NORMAL     | NORMAL      | PASS    | rule_based    |   0.99 |
| IMPOSS_01 | Vikram Seth    | 60.0 km | 10.0 m | 360.0 km/h  | SUSPICIOUS | SUSPICIOUS  | PASS    | rule_based    |   1    |
| IMPOSS_02 | Rohit Gill     | 55.0 km | 15.0 m | 220.0 km/h  | SUSPICIOUS | SUSPICIOUS  | PASS    | rule_based    |   1    |
| IMPOSS_03 | Alok Mishra    | 35.0 km | 0.0 m  | 0.0 km/h    | SUSPICIOUS | SUSPICIOUS  | PASS    | rule_based    |   1    |
| IMPOSS_04 | Nitin Gadkari  | 80.0 km | 20.0 m | 240.0 km/h  | SUSPICIOUS | SUSPICIOUS  | PASS    | rule_based    |   1    |
| IMPOSS_05 | Harish Rawat   | 25.0 km | 5.0 m  | 300.0 km/h  | SUSPICIOUS | SUSPICIOUS  | PASS    | rule_based    |   1    |
| BORDER_01 | Sameer Khan    | 72.0 km | 60.0 m | 72.0 km/h   | NORMAL     | NORMAL      | PASS    | llm_reasoning |   0.9  |
| BORDER_02 | Gaurav Sen     | 85.0 km | 45.0 m | 113.33 km/h | SUSPICIOUS | SUSPICIOUS  | PASS    | llm_reasoning |   0.88 |
| BORDER_03 | Tina D'Souza   | 68.0 km | 60.0 m | 68.0 km/h   | NORMAL     | NORMAL      | PASS    | llm_reasoning |   0.9  |
| BORDER_04 | Pawan Kalyan   | 65.0 km | 30.0 m | 130.0 km/h  | SUSPICIOUS | SUSPICIOUS  | PASS    | llm_reasoning |   0.88 |
| BORDER_05 | Vijay Shankar  | 78.0 km | 60.0 m | 78.0 km/h   | NORMAL     | NORMAL      | PASS    | llm_reasoning |   0.9  |
| BORDER_06 | Mohit Chauhan  | 70.0 km | 40.0 m | 105.0 km/h  | SUSPICIOUS | SUSPICIOUS  | PASS    | llm_reasoning |   0.88 |
| DWELL_01  | Arjun Rampal   | 12.0 km | 60.0 m | 12.0 km/h   | SUSPICIOUS | SUSPICIOUS  | PASS    | rule_based    |   0.98 |
| DWELL_02  | Karan Johar    | 25.0 km | 90.0 m | 16.67 km/h  | SUSPICIOUS | SUSPICIOUS  | PASS    | rule_based    |   0.98 |
| DWELL_03  | Fatima Sana    | 10.0 km | 30.0 m | 20.0 km/h   | NORMAL     | NORMAL      | PASS    | rule_based    |   0.99 |
| DWELL_04  | Lata Mangeshka | 16.0 km | 45.0 m | 21.33 km/h  | NORMAL     | NORMAL      | PASS    | rule_based    |   0.99 |

