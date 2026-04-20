# CSV Import Feature Documentation

## Overview
The CSV Import feature allows you to quickly load dose-response data from CSV files into the Dose Response Pro application, eliminating the need for manual data entry.

## Features

### 1. Smart CSV Parsing
- **Flexible column ordering**: Columns can be in any order
- **Intelligent header detection**: Automatically identifies Study, Dose, Cases, and N columns
- **Quoted value support**: Handles CSV files with quoted values
- **Multiple study support**: Import multiple studies with multiple dose points each
- **Automatic grouping**: Dose points are automatically grouped by study name

### 2. Data Validation
- Validates required columns (Study, Dose, Cases, N/PersonTime)
- Skips invalid or incomplete rows
- Checks for numeric values in Dose, Cases, and N fields
- Provides clear error messages for invalid data

### 3. User-Friendly Interface
- One-click import via "Import CSV" button
- Inline CSV format guide with expandable help section
- Toast notifications for success/error feedback
- Automatic clearing of existing data before import

## How to Use

### Step 1: Prepare Your CSV File
Create a CSV file with the following format:

```csv
Study,Dose,Cases,N
Study1,0,10,100
Study1,10,15,100
Study1,20,25,100
Study2,0,8,100
Study2,10,12,100
Study2,20,18,100
```

### Step 2: Import the File
1. Open the Dose Response Pro application
2. Navigate to the "Data" panel
3. Click the "Import CSV" button (📥)
4. Select your CSV file
5. The data will be automatically imported and displayed

### Step 3: Verify and Analyze
- Review the imported studies in the data entry panel
- Edit study names or add/remove dose points if needed
- Click "Run Analysis" to perform dose-response analysis

## CSV Format Requirements

### Required Columns
Your CSV file must contain these columns (case-insensitive):

- **Study**: Name or identifier for the study
- **Dose**: Dose level or exposure amount
- **Cases**: Number of cases or events at that dose level
- **N** (or **PersonTime**, **SampleSize**): Total sample size or person-time

### Column Variations Supported
- Study: `study`, `study name`, `study_id`
- Dose: `dose`, `dosage`, `exposure`, `level`
- Cases: `cases`, `events`, `case`
- N: `n`, `sample`, `sample size`, `person`, `persontime`, `person-time`

### Format Rules
1. **First row must be headers**: Column names in the first row
2. **Comma-separated**: Use commas to separate columns
3. **One dose point per row**: Each row represents one dose level for one study
4. **Multiple dose points per study**: List all dose points for a study consecutively
5. **Numeric values**: Dose, Cases, and N must be valid numbers
6. **Optional quoting**: Values can be quoted (e.g., "Study 1")

### Example CSV Files

#### Basic Example
```csv
Study,Dose,Cases,N
Study A,0,10,100
Study A,10,15,100
Study A,20,25,100
Study B,0,8,100
Study B,10,12,100
```

#### With Different Column Order
```csv
Cases,Study,N,Dose
10,Study A,100,0
15,Study A,100,10
25,Study A,100,20
8,Study B,100,0
12,Study B,100,10
```

#### With Quoted Values
```csv
"Study Name","Dose Level","Cases","Sample Size"
"Smith et al. 2020",0,10,100
"Smith et al. 2020",10,15,100
"Jones et al. 2021",0,8,100
"Jones et al. 2021",10,12,100
```

## Error Handling

### Common Errors and Solutions

#### Error: "CSV must have columns: Study, Dose, Cases, N"
**Cause**: Missing required columns
**Solution**: Ensure your CSV has all required columns (case-insensitive)

#### Error: "No valid studies found in CSV"
**Cause**: All rows have invalid or missing data
**Solution**: Check that numeric columns contain valid numbers

#### Error: "CSV file must have at least a header row and one data row"
**Cause**: Empty or single-row CSV file
**Solution**: Ensure your CSV has a header row and at least one data row

## Features in Detail

### 1. Column Detection Algorithm
The parser uses flexible matching to identify columns:
- Performs case-insensitive matching
- Checks for partial string matches (e.g., "person" matches "person", "person-time", "persontime")
- Supports common variations of column names

### 2. Data Grouping
- Groups dose points by study name
- Creates separate study cards for each unique study
- Maintains the order of dose points as they appear in the CSV

### 3. Error Recovery
- Skips rows with invalid numeric data
- Continues processing after encountering errors
- Reports the number of successfully imported studies

## Integration with Existing Features

The CSV import feature integrates seamlessly with:
- **Manual data entry**: Edit imported data manually
- **JSON import/export**: Export as JSON and re-import later
- **Demo data**: Switch between imported and demo data
- **All analysis models**: Works with GLS, linear, quadratic, cubic, spline, and exponential models

## Technical Implementation

### Key Functions

#### `importCSV()`
Triggers the file selection dialog

#### `importFromCSV(file)`
Reads and processes the selected CSV file

#### `parseCSVData(csvText)`
Parses CSV text and validates structure
- Extracts header row
- Validates required columns
- Groups data by study
- Returns array of study objects

#### `parseCSVLine(line)`
Handles quoted values in CSV lines
- Properly processes commas within quoted strings
- Removes quotes from values

#### `addStudyWithData(studyData)`
Creates study cards with pre-populated data
- Bypasses manual entry
- Creates input fields with imported values
- Maintains consistency with manually-added studies

### File Input Element
- Hidden file input element created on page load
- Accepts `.csv` and `.txt` files
- Automatically resets after import to allow re-importing

## Browser Compatibility
- Works in all modern browsers (Chrome, Firefox, Safari, Edge)
- Uses FileReader API for local file reading
- No server-side processing required

## Performance
- Efficient parsing for large datasets
- Handles thousands of rows without performance issues
- Minimal memory footprint

## Security
- Client-side only processing
- No data transmission to external servers
- Files are read locally in the browser

## Future Enhancements
Potential improvements for future versions:
- Excel file (.xlsx) support
- Drag-and-drop file upload
- Column mapping interface for custom formats
- Data preview before import
- Undo/redo functionality for imports
- Batch import from multiple files

## Support
For issues or questions:
1. Check the CSV format guide in the application
2. Verify your CSV matches the required format
3. Review error messages carefully
4. Try the sample CSV file provided

## Sample CSV File
A sample CSV file is included at: `C:\dosehtml\sample_dose_response_data.csv`

Use this file to test the CSV import feature.
